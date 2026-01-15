    using DeskLinkAgent.DeviceId;
    using DeskLinkAgent.IPC;
    using DeskLinkAgent.Networking;
    using DeskLinkAgent.Remote;
    using System.Text.Json;

    namespace DeskLinkAgent;

    internal class Program
    {
        private static LocalApiServer? _apiServer;
        private static AgentIpcServer? _ipcServer;
        private static SocketClient? _socketClient;
        private static DeviceConfig? _config;
        private static ManualResetEventSlim _provisioningSignal = new ManualResetEventSlim(false);

        public static async Task Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                Console.Error.WriteLine($"[Unhandled] {e.ExceptionObject}");
            };

            Console.WriteLine("[DeskLinkAgent] Starting (Zero-Config Mode)...");

            // 1. Load or Initialize Configuration
            if (!DeviceIdProvider.LoadConfig(out var config))
            {
                config = new DeviceConfig();
            }
            _config = config;

            // 2. Ensure Device ID
            if (string.IsNullOrWhiteSpace(_config.DeviceId))
            {
                _config.DeviceId = DeviceIdProvider.GetOrCreateDeviceId();
                DeviceIdProvider.SaveConfig(_config);
            }
            Console.WriteLine($"[DeskLinkAgent] Device ID: {_config.DeviceId}");

            // 3. Hardcoded Server URL (Production/Render)
            // Ideally this comes from a build config, but for this task we hardcode the target.
            if (string.IsNullOrWhiteSpace(_config.ServerUrl))
            {
                _config.ServerUrl = "https://desklinkrender5.onrender.com";
                DeviceIdProvider.SaveConfig(_config);
            }
            // Force override to ensure we use the correct one if user has old local config
            // _config.ServerUrl = "https://desklinkrender5.onrender.com"; 
            
            Console.WriteLine($"[DeskLinkAgent] Server URL: {_config.ServerUrl}");

            // 4. Start local HTTP API & IPC
            _apiServer = new LocalApiServer(_config.DeviceId);
            _apiServer.OnProvisioned += HandleProvisioning;
            await _apiServer.StartAsync();
            Console.WriteLine($"[DeskLinkAgent] Local API listening on http://127.0.0.1:17600");

            _ipcServer = new AgentIpcServer(_config.DeviceId);
            _ipcServer.Start();

            // 5. Check if we are already provisioned
            if (!string.IsNullOrWhiteSpace(_config.OwnerJwt))
            {
                Console.WriteLine("[DeskLinkAgent] Found existing token. Connecting...");
                await ConnectSocketAsync();
            }
            else
            {
                Console.WriteLine("[DeskLinkAgent] No token found. Waiting for provisioning via Web App...");
                // The OnProvisioned event will trigger connection when token arrives.
            }

            // 6. Keep Alive
            Console.WriteLine("\n[DeskLinkAgent] Service is running.");
            Console.WriteLine("Press Ctrl+C to exit.");

            var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                cts.Cancel();
            };

            try
            {
                await Task.Delay(Timeout.Infinite, cts.Token);
            }
            catch (TaskCanceledException) { }

            await ShutdownAsync();
        }

        private static async Task HandleProvisioning(string token)
        {
            if (_config == null) return;
            
            Console.WriteLine("[DeskLinkAgent] Received Token via Local API!");
            _config.OwnerJwt = token;
            DeviceIdProvider.SaveConfig(_config); // Save for next time

            // If we're not connected, connect now
            if (_socketClient == null)
            {
                await ConnectSocketAsync();
            }
            else
            {
                // If already connected? (Should rely on disconnect/reconnect logic if needed, but for now we assume fresh start)
                // Maybe restart process? 
                Console.WriteLine("[DeskLinkAgent] Token updated. Restarting agent is recommended but we will try to connect.");
                // For now, simpler is better.
            }
        }

        private static async Task ConnectSocketAsync()
        {
            if (_config == null || string.IsNullOrWhiteSpace(_config.OwnerJwt)) return;

            Environment.SetEnvironmentVariable("AGENT_OWNER_JWT", _config.OwnerJwt);

            _socketClient = new SocketClient(_config.DeviceId, _ipcServer!);
            
            // ConnectAsync handles the provisioning API call to backend using the OwnerJwt
            await _socketClient.ConnectAsync(_config.ServerUrl!);
        }

        private static async Task ShutdownAsync()
        {
            Console.WriteLine("[DeskLinkAgent] Shutting down...");
            try { await (_apiServer?.StopAsync() ?? Task.CompletedTask); } catch { }
            try { _ipcServer?.Dispose(); } catch { }
            try { await (_socketClient?.DisposeAsync() ?? ValueTask.CompletedTask); } catch { }
            Console.WriteLine("[DeskLinkAgent] Bye.");
        }
    }
