using WatsonWebserver;
using WatsonWebserver.Core;
using System.Text;
using System.Text.Json;
using HttpMethod = WatsonWebserver.Core.HttpMethod;

namespace DeskLinkAgent.Networking;

public class LocalApiServer
{
    private readonly string _deviceId;
    private readonly Webserver _server;

    public const int Port = 17600;
    
    public event Func<string, Task>? OnProvisioned;

    public LocalApiServer(string deviceId)
    {
        _deviceId = deviceId;
        
        WebserverSettings settings = new WebserverSettings
        {
            Hostname = "127.0.0.1",
            Port = Port
        };
        
        _server = new Webserver(settings, DefaultRoute);

        _server.Routes.PreRouting = (HttpContextBase ctx) =>
        {
            // simple CORS for local usage
            ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
            ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
            if (ctx.Request.Method == HttpMethod.OPTIONS)
            {
                ctx.Response.StatusCode = 204;
                ctx.Response.Send().Wait();
                return Task.FromResult(false); // skip routing
            }
            return Task.FromResult(true);
        };

        _server.Routes.PreAuthentication.Static.Add(HttpMethod.GET, "/device-id", async (HttpContextBase ctx) =>
        {
            var payload = JsonSerializer.Serialize(new { deviceId = _deviceId });
            ctx.Response.StatusCode = 200;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.Send(payload);
        });

        _server.Routes.PreAuthentication.Static.Add(HttpMethod.POST, "/provision", async (HttpContextBase ctx) =>
        {
             try
            {
                using var reader = new StreamReader(ctx.Request.Data);
                var body = await reader.ReadToEndAsync();
                var json = JsonSerializer.Deserialize<JsonElement>(body);
                
                if (json.TryGetProperty("token", out var tokenProp))
                {
                    var token = tokenProp.GetString();
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        Console.WriteLine("[LocalApi] Provision token received.");
                        
                        // Fire and forget the provisioning task so we don't block the HTTP response too long
                        _ = Task.Run(async () => 
                        {
                            if (OnProvisioned != null) await OnProvisioned.Invoke(token);
                        });

                        ctx.Response.StatusCode = 200;
                        await ctx.Response.Send("OK");
                        return;
                    }
                }
                
                ctx.Response.StatusCode = 400;
                await ctx.Response.Send("Missing token");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[LocalApi] Provision error: " + ex);
                ctx.Response.StatusCode = 500;
                await ctx.Response.Send("Error");
            }
        });

        _server.Routes.PreAuthentication.Static.Add(HttpMethod.POST, "/remote/start", async (HttpContextBase ctx) =>
        {
            Console.WriteLine("[LocalApi] remote start requested");
            ctx.Response.StatusCode = 200;
            await ctx.Response.Send("OK");
        });

        _server.Routes.PreAuthentication.Static.Add(HttpMethod.POST, "/remote/stop", async (HttpContextBase ctx) =>
        {
            Console.WriteLine("[LocalApi] remote stop requested");
            ctx.Response.StatusCode = 200;
            await ctx.Response.Send("OK");
        });
    }

    private async Task DefaultRoute(HttpContextBase ctx)
    {
        ctx.Response.StatusCode = 404;
        await ctx.Response.Send("Not Found");
    }

    public Task StartAsync()
    {
        _server.Start();
        return Task.CompletedTask;
    }

    public Task StopAsync()
    {
        _server.Stop();
        return Task.CompletedTask;
    }
}