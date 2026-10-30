using AnalisisComercial.Infrastructure;
using AnalisisComercial.Infrastructure.Datos;
using AnalisisComercial.Infrastructure.Sincronizacion;
using AnalisisComercial.Sync;
using Microsoft.EntityFrameworkCore;

// Proceso de sincronización con Chess (CONTEXTO_BACKEND §5). Uso:
//   dotnet run                        servicio: todos los días a la hora configurada y cuando el Admin lo pide
//   dotnet run -- --una-vez           una corrida, muestra el resumen por mes y termina (la carga inicial, o probar)
//   dotnet run -- --una-vez --recalcular-compras   además recalcula CompraMes de todos los meses (cambió la regla)
//   dotnet run -- --una-vez --recargar-ventas      vuelve a leer las ventas de todos los meses (un campo nuevo)
// Para bajar los datos a mano está sincronizar.bat (pide la clave de Chess la primera vez).
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddInfraestructura(builder.Configuration);
builder.Services.Configure<OpcionesSync>(builder.Configuration.GetSection("Sync"));
var unaVez = args.Contains("--una-vez");
var recalcular = args.Contains("--recalcular-compras");
var recargar = args.Contains("--recargar-ventas");
if (!unaVez)
    builder.Services.AddHostedService<Trabajador>();

var host = builder.Build();
using (var scope = host.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ComercialDbContext>();
    if (builder.Configuration.GetValue("Base:MigrarAlIniciar", true))
        await db.Database.MigrateAsync();
    if (unaVez)
    {
        var r = await scope.ServiceProvider.GetRequiredService<Sincronizador>().CorrerAsync(recalcular, CancellationToken.None, recargar);
        await Resumen.MostrarAsync(db, r.IdCorrida);
        return r.Ok ? 0 : 1;
    }
}
await host.RunAsync();
return 0;
