using AnalisisComercial.Application;
using AnalisisComercial.Infrastructure.Datos;
using AnalisisComercial.Infrastructure.Sincronizacion;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Sync;

/// <summary>Sección "Sync".</summary>
public class OpcionesSync
{
    /// <summary>Hora de Argentina de la corrida diaria.</summary>
    public TimeOnly HoraDiaria { get; set; } = new(5, 0);
    /// <summary>Cada cuánto se mira si el Admin pidió «Actualizar ahora».</summary>
    public int SegundosEntreChequeos { get; set; } = 30;
}

/// <summary>
/// Corre la sincronización: una vez por día a <see cref="OpcionesSync.HoraDiaria"/>, cuando el Admin la pide
/// (SyncSolicitud) y, si la base está vacía, apenas arranca (la carga inicial). Una corrida a la vez.
/// </summary>
public class Trabajador(IServiceScopeFactory scopes, IReloj reloj, IOptions<OpcionesSync> opciones, ILogger<Trabajador> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ChequearAsync(ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                log.LogError(ex, "Falló el chequeo de la sincronización; se reintenta en el próximo.");
            }
            await Task.Delay(TimeSpan.FromSeconds(opciones.Value.SegundosEntreChequeos), ct);
        }
    }

    private async Task ChequearAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ComercialDbContext>();
        var ahora = reloj.Ahora;

        string? motivo = null;
        var pedida = await db.SyncSolicitudes.Where(s => s.TomadoEn == null).OrderBy(s => s.SolicitadoEn).ToListAsync(ct);
        if (pedida.Count > 0)
        {
            // Se toman todas las pendientes juntas: una sola corrida las cubre.
            foreach (var s in pedida)
                s.TomadoEn = ahora;
            await db.SaveChangesAsync(ct);
            motivo = $"pedida por {pedida[0].SolicitadoPor}";
        }
        else if (!await db.SyncLogs.AnyAsync(ct))
        {
            motivo = "carga inicial";
        }
        else
        {
            var hoy = DateOnly.FromDateTime(ahora.DateTime);
            var hora = new DateTimeOffset(hoy.ToDateTime(opciones.Value.HoraDiaria), ahora.Offset);
            if (ahora >= hora && !await db.SyncLogs.AnyAsync(s => s.Inicio >= hora, ct))
                motivo = "diaria";
        }
        if (motivo is null)
            return;

        log.LogInformation("Sincronización {Motivo}.", motivo);
        var r = await scope.ServiceProvider.GetRequiredService<Sincronizador>().CorrerAsync(recalcularCompras: false, ct);
        log.LogInformation("Sincronización {Motivo} terminada: {Estado}.", motivo, r.Ok ? "OK" : "con errores (ver SyncLog)");
    }
}
