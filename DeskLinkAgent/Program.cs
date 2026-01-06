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

        public static async Task Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                Console.Error.WriteLine($"[Unhandled] {e.ExceptionObject}");
            };

            Console.WriteLine("[DeskLinkAgent] Starting...");

            // 1. Load or Initialize Configuration
            if (!DeviceIdProvider.LoadConfig(out var config))
            {
                config = new DeviceConfig();
            }

            // 2. Ensure Device ID
            if (string.IsNullOrWhiteSpace(config.DeviceId))
            {
                config.DeviceId = DeviceIdProvider.GetOrCreateDeviceId();
                DeviceIdProvider.SaveConfig(config);
            }
            Console.WriteLine($"[DeskLinkAgent] Device ID: {config.DeviceId}");

            // 3. Ensure Server URL
            if (string.IsNullOrWhiteSpace(config.ServerUrl))
            {
                Console.Write("Enter Backend Server URL [default: http://localhost:5000]: ");
                string? inputUrl = Console.ReadLine();
                config.ServerUrl = string.IsNullOrWhiteSpace(inputUrl) ? "http://localhost:5000" : inputUrl.Trim();
                DeviceIdProvider.SaveConfig(config);
            }
            Console.WriteLine($"[DeskLinkAgent] Server URL: {config.ServerUrl}");

            // 4. Ensure Owner JWT (User Token)
            if (string.IsNullOrWhiteSpace(config.OwnerJwt))
            {
                Console.WriteLine("\n[Setup Required] Please enter your User Authentication Token.");
                Console.WriteLine("You can copy this from the browser Developer Tools -> Application -> Local Storage -> 'token' or similar.");
                Console.Write("Paste Token: ");
                string? token = Console.ReadLine();
                if (string.IsNullOrWhiteSpace(token))
                {
                    Console.WriteLine("[Error] Token is required to register this device. Exiting.");
                    return;
                }
                config.OwnerJwt = token.Trim();
                DeviceIdProvider.SaveConfig(config);
            }

            // Set environment variable for SocketClient to pick up (avoiding deep refactor of SocketClient for now)
            Environment.SetEnvironmentVariable("AGENT_OWNER_JWT", config.OwnerJwt);

            // 5) Start local HTTP API
            _apiServer = new LocalApiServer(config.DeviceId);
            await _apiServer.StartAsync();
            Console.WriteLine($"[DeskLinkAgent] Local API listening on http://127.0.0.1:17600");

            // 6) IPC server
            _ipcServer = new AgentIpcServer(config.DeviceId);
            _ipcServer.Start();

            // 7) Socket.IO client
            _socketClient = new SocketClient(config.DeviceId, _ipcServer);
            await _socketClient.ConnectAsync(config.ServerUrl);

            Console.WriteLine("\n[DeskLinkAgent] Agent is running and connected.");
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

        private static async Task ShutdownAsync()
        {
            Console.WriteLine("[DeskLinkAgent] Shutting down...");
            try { await (_apiServer?.StopAsync() ?? Task.CompletedTask); } catch { }
            try { _ipcServer?.Dispose(); } catch { }
            try { await (_socketClient?.DisposeAsync() ?? ValueTask.CompletedTask); } catch { }
            Console.WriteLine("[DeskLinkAgent] Bye.");
        }
    }
