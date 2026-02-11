using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using SocketIOClient;
using DeskLinkAgent.IPC;
using DeskLinkAgent.WebRTC;

namespace DeskLinkAgent.Networking;

public class SocketClient : IAsyncDisposable
{
    private readonly string _deviceId;
    private readonly AgentIpcServer _ipc;
    private SocketIOClient.SocketIO? _client;
    private WebRTCLauncher? _webrtcLauncher;
    private string? _agentJwt;
    private string? _ownerUserId;

    public SocketClient(string deviceId, AgentIpcServer ipc)
    {
        _deviceId = deviceId;
        _ipc = ipc;
    }

    public async Task<bool> ConnectAsync(string serverUrl)
    {
        Console.WriteLine($"[Socket] ConnectAsync => serverUrl={serverUrl}");

        var ownerJwt = Environment.GetEnvironmentVariable("AGENT_OWNER_JWT");
        if (string.IsNullOrWhiteSpace(ownerJwt))
        {
            Console.Error.WriteLine("[Agent] AGENT_OWNER_JWT is not set.");
            return false;
        }

        // NO PROVISIONING NEEDED. We use the Owner (User) JWT directly.
        // This authenticates the socket as the User, and we register the DeviceId on connection.
        _agentJwt = ownerJwt;
        _ownerUserId = ExtractUserIdFromToken(_agentJwt);
        if (string.IsNullOrEmpty(_ownerUserId))
        {
             Console.WriteLine("[Agent] Warning: Could not extract user ID from token. WebRTC might fail.");
             _ownerUserId = "unknown";
        }
        else 
        {
             Console.WriteLine($"[Agent] Extracted User ID: {_ownerUserId}");
        } 
        
        // We'll decode the JWT simply to get the user ID for logs/logic if needed, 
        // or just rely on backend. For now, let's skip local decode unless strictly needed.
        // The backend knows who we are.

        // Use fully-qualified type to avoid namespace/type ambiguity
        _client = new SocketIOClient.SocketIO(serverUrl, new SocketIOOptions
        {
            Reconnection = true,
            ReconnectionAttempts = int.MaxValue,
            ReconnectionDelay = 2000,
            Auth = new Dictionary<string, object>
            {
                { "token", _agentJwt }
            }
        });

        // Connected handler
        _client.OnConnected += async (_, __) =>
        {
            Console.WriteLine("[Socket] connected ✓");

            // Register device so server maps deviceId -> socketId and persists it
            await Emit("register", new { deviceId = _deviceId, label = Environment.MachineName, osInfo = Environment.OSVersion.ToString() });

            Console.WriteLine("[Socket] register emitted ✓");
        };

        // Disconnected handler
        _client.OnDisconnected += (_, reason) =>
        {
            Console.WriteLine("[Socket] disconnected => " + reason);
        };

        // Server -> Agent events

        // 1. INCOMING REQUEST
        _client.On("desklink-remote-request", async response =>
        {
             try 
             {
                var json = response.GetValue<JsonElement>();
                var sessionId = json.GetProperty("sessionId").GetString();
                var callerName = json.GetProperty("callerName").GetString();
                var meetingId = json.GetProperty("meetingId").GetString();

                Console.WriteLine($"[Socket] desklink-remote-request: {callerName} wants access (Session: {sessionId})");

                // Show native dialog (blocking on a separate thread usually, but here we await it or run it)
                // Since this callback might be on a socket/threadpool thread, showing UI is okay for a Console app (MessageBox blocks that thread).
                // For better UX, we run it on a task to not block socket loop if there were other events (though unlikely to have many concurrent).
                
                // Fire and forget the dialog task? No, we need result.
                bool accepted = await Task.Run(() => DeskLinkAgent.Utils.UserInterface.ShowRequestDialog(callerName));

                if (accepted)
                {
                    Console.WriteLine($"[Agent] Request ACCEPTED by user. Sending API call...");
                    await AcceptRemoteRequest(sessionId, meetingId);
                }
                else
                {
                    Console.WriteLine($"[Agent] Request REJECTED by user.");
                    await RejectRemoteRequest(sessionId);
                }
             }
             catch (Exception ex)
             {
                 Console.Error.WriteLine("[Socket] Error handling desklink-remote-request: " + ex);
             }
        });

        // 2. SESSION STARTED (Auto-start WebRTC)
        _client.On("desklink-session-start", response =>
        {
            try
            {
                var json = response.GetValue<JsonElement>();
                var sessionId = json.GetProperty("sessionId").GetString();
                var token = json.GetProperty("token").GetString();
                var role = json.GetProperty("role").GetString(); // "receiver" (Host) or "caller" (Viewer)
                var callerDeviceId = json.GetProperty("callerDeviceId").GetString();
                var receiverDeviceId = json.GetProperty("receiverDeviceId").GetString();

                Console.WriteLine($"[Socket] desklink-session-start => session={sessionId}, role={role}");

                // Start WebRTC helper
                // Note: We pass _agentJwt (which is User Token) to NodeHelper so it can also auth with backend
                // NodeHelper needs: sessionId, token (ephemeral), deviceId, userId (owner), remoteDeviceId
                
                // We assume _ownerUserId is needed. If we didn't decode it, we might need to fetch it or pass 'unknown'.
                // Ideally backend gives us everything we need.
                
                StartWebRTC(sessionId!, token!, role!, callerDeviceId!, receiverDeviceId!, serverUrl);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Socket] error parsing desklink-session-start: " + ex);
            }
        });
        
        // 3. SESSION ENDED
        _client.On("desklink-remote-response", response =>
        {
             try
             {
                var json = response.GetValue<JsonElement>();
                if (json.TryGetProperty("status", out var statusProp) && statusProp.GetString() == "ended")
                {
                    Console.WriteLine("[Socket] desklink-remote-response (ended)");
                    try { _ipc.NotifyRemoteSessionEnded(); } catch {}
                    StopWebRTC();
                }
             }
             catch {}
        });

        _client.On("webrtc-cancel", _ =>
        {
            Console.WriteLine("[Socket] webrtc-cancel received");
            StopWebRTC();
        });

        if (!await ValidateServerConnection(serverUrl))
        {
            Console.Error.WriteLine("[Agent] Server validation failed. Aborting connection.");
            return false;
        }

        await _client.ConnectAsync();
        StartHeartbeatLoop(serverUrl);
        return true;
    }

    private async Task<bool> ValidateServerConnection(string serverUrl)
    {
        Console.WriteLine("[Agent] Validating server connection...");
        try
        {
            using var http = new System.Net.Http.HttpClient();
            http.Timeout = TimeSpan.FromSeconds(5);
            var healthUrl = serverUrl.TrimEnd('/') + "/health";
            
            var response = await http.GetAsync(healthUrl);
            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine("[Agent] Server connection valid (Health Check OK).");
                return true;
            }
            
            Console.Error.WriteLine($"[Agent] Server health check failed. Status: {response.StatusCode}");
            return false;
        }
        catch (System.Net.Http.HttpRequestException ex)
        {
            Console.Error.WriteLine($"[Agent] Server connection failed: {ex.Message}");
            if (ex.InnerException != null)
            {
                Console.Error.WriteLine($"[Agent] Inner error: {ex.InnerException.Message}");
            }
            return false;
        }
        catch (TaskCanceledException)
        {
            Console.Error.WriteLine("[Agent] Server connection timed out.");
            return false;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Agent] Unexpected error validating server: {ex.Message}");
            return false;
        }
    }

    public async Task Emit(string eventName, object payload)
    {
        try
        {
            if (_client == null) return;
            await _client.EmitAsync(eventName, payload);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Socket] emit error ({eventName}): {ex.Message}");
        }
    }

    private void StartWebRTC(string sessionId, string token, string role, string callerDeviceId, string receiverDeviceId, string serverUrl)
    {
        try
        {
            StopWebRTC();

            var remoteDeviceId = role == "receiver" ? callerDeviceId : receiverDeviceId;

            if (string.IsNullOrWhiteSpace(_agentJwt))
            {
                Console.Error.WriteLine("[Socket] Cannot start WebRTC: missing agentJwt.");
                return;
            }

            if (string.IsNullOrWhiteSpace(_ownerUserId))
            {
                Console.Error.WriteLine("[Socket] Cannot start WebRTC: missing ownerUserId.");
                return;
            }

            _webrtcLauncher = new WebRTCLauncher(
                sessionId,
                token,
                _deviceId,
                _ownerUserId!,
                remoteDeviceId,
                role,
                serverUrl,
                _agentJwt!
            );

            _webrtcLauncher.Start();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Socket] Failed to start WebRTC: " + ex);
        }
    }

    private void StopWebRTC()
    {
        try
        {
            _webrtcLauncher?.Dispose();
            _webrtcLauncher = null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Socket] StopWebRTC error: " + ex);
        }
    }

    private System.Threading.CancellationTokenSource? _heartbeatCts;

    private void StartHeartbeatLoop(string serverUrl)
    {
        _heartbeatCts?.Cancel();
        _heartbeatCts = new System.Threading.CancellationTokenSource();
        var token = _heartbeatCts.Token;

        Task.Run(async () =>
        {
            var heartbeatUrl = serverUrl.TrimEnd('/') + "/api/device/heartbeat";
            Console.WriteLine("[Agent] Starting heartbeat loop...");

            while (!token.IsCancellationRequested)
            {
                try
                {
                    using var http = new System.Net.Http.HttpClient();
                    // agentJwt is a valid user token generated by provision
                    http.DefaultRequestHeaders.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _agentJwt);

                    var payload = new { deviceId = _deviceId, status = "online" };
                    var json = JsonSerializer.Serialize(payload);
                    var content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");

                    var resp = await http.PostAsync(heartbeatUrl, content, token);
                    if (!resp.IsSuccessStatusCode)
                    {
                        Console.Error.WriteLine($"[Agent] Heartbeat failed: {resp.StatusCode}");
                    }
                }
                catch (TaskCanceledException) { break; }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[Agent] Heartbeat error: {ex.Message}");
                }

                try { await Task.Delay(30000, token); } catch { break; }
            }
            Console.WriteLine("[Agent] Heartbeat loop stopped.");
        }, token);
    }

    private string? ExtractUserIdFromToken(string token)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3) return null;

            var payload = parts[1];
            // Base64Url decode
            payload = payload.Replace('-', '+').Replace('_', '/');
            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "="; break;
            }

            var json = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(payload));
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("id", out var idProp)) return idProp.GetString();
            if (doc.RootElement.TryGetProperty("userId", out var uIdProp)) return uIdProp.GetString();
            if (doc.RootElement.TryGetProperty("_id", out var _idProp)) return _idProp.GetString();
            
            return null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Agent] JWT decode error: " + ex.Message);
            return null;
        }
    }

    private async Task AcceptRemoteRequest(string sessionId, string meetingId = "")
    {
        try
        {
            var url = _client?.ServerUrl.TrimEnd('/') + "/api/remote/accept";
            using var http = new System.Net.Http.HttpClient();
            http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _agentJwt);

            var payload = new 
            {
                sessionId,
                receiverDeviceId = _deviceId,
                permissions = new { allowControl = true, viewOnly = false } // Default permissions
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");

            var resp = await http.PostAsync(url, content);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync();
                Console.Error.WriteLine($"[Agent] Accept failed ({resp.StatusCode}): {err}");
            }
            else
            {
                Console.WriteLine("[Agent] Successfully accepted session locally. Waiting for start signal...");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Agent] Accept exception: " + ex.Message);
        }
    }

    private async Task RejectRemoteRequest(string sessionId)
    {
        try
        {
            var url = _client?.ServerUrl.TrimEnd('/') + "/api/remote/reject";
            using var http = new System.Net.Http.HttpClient();
            http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _agentJwt);

            var payload = new { sessionId };
            var json = JsonSerializer.Serialize(payload);
            var content = new System.Net.Http.StringContent(json, System.Text.Encoding.UTF8, "application/json");

            await http.PostAsync(url, content);
            Console.WriteLine("[Agent] Session rejected.");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Agent] Reject exception: " + ex.Message);
        }
    }

    public ValueTask DisposeAsync()
    {
        try
        {
            _heartbeatCts?.Cancel();
            StopWebRTC();
            _client?.Dispose();
        }
        catch { }

        return ValueTask.CompletedTask;
    }
}
