using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Sync;

/// <summary>
/// Lo que se muestra al terminar una corrida a mano: cómo salió cada paso y, por mes, lo que hay en la base. La columna
/// «Base CCC» son los clientes con compra de la Base App CCC 20.10 (el Control 1 de CONTEXTO_BACKEND §9).
/// </summary>
public static class Resumen
{
    private static readonly Dictionary<int, int> BaseCcc = new() { [7] = 766, [8] = 836, [9] = 846, [10] = 819 };   // corte 20/10/2026

    public static async Task MostrarAsync(ComercialDbContext db, Guid corrida)
    {
        var pasos = await db.SyncLogs.AsNoTracking().Where(s => s.IdCorrida == corrida).OrderBy(s => s.Id).ToListAsync();
        Console.WriteLine();
        Console.WriteLine("Pasos de la corrida");
        Console.WriteLine(new string('-', 96));
        foreach (var p in pasos)
        {
            var rango = p.Desde is null ? "" : $"{p.Desde:dd/MM}–{p.Hasta:dd/MM}";
            var seg = p.Fin is { } f ? $"{(f - p.Inicio).TotalSeconds,5:0}s" : "";
            Console.WriteLine($"  {(p.Ok ? "OK   " : "ERROR")} {p.Endpoint,-20} {rango,-12} {p.Registros,8:N0} {seg}  {p.Error}");
        }

        var lineas = await db.VentaLineas.AsNoTracking().GroupBy(l => new { l.Fecha.Year, l.Fecha.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Lineas = g.Count() }).ToListAsync();
        var compras = await db.ComprasMes.AsNoTracking().Where(c => c.Compro).GroupBy(c => c.Mes)
            .Select(g => new { Mes = g.Key, Clientes = g.Select(c => c.IdCliente).Distinct().Count() }).ToListAsync();
        var carteras = await db.CarterasMes.AsNoTracking().GroupBy(c => c.Mes)
            .Select(g => new { Mes = g.Key, Clientes = g.Count() }).ToListAsync();

        Console.WriteLine();
        Console.WriteLine("Por mes                líneas   clientes con compra   Base CCC (20/10)   cartera");
        Console.WriteLine(new string('-', 96));
        foreach (var m in lineas.Select(l => new DateOnly(l.Year, l.Month, 1)).Union(carteras.Select(c => c.Mes)).Distinct().Order())
        {
            var l = lineas.FirstOrDefault(x => x.Year == m.Year && x.Month == m.Month)?.Lineas ?? 0;
            var c = compras.FirstOrDefault(x => x.Mes == m)?.Clientes ?? 0;
            var k = carteras.FirstOrDefault(x => x.Mes == m)?.Clientes ?? 0;
            var ccc = BaseCcc.TryGetValue(m.Month, out var b) && m.Year == 2026 ? $"{b,8:N0}" : "       –";
            Console.WriteLine($"  {m:MM/yyyy}         {l,10:N0}   {c,19:N0}   {ccc,16}   {k,7:N0}");
        }
        Console.WriteLine();
        Console.WriteLine("Octubre en la base llega hasta hoy; la Base CCC, hasta el 20/10: en octubre la base tiene que dar más.");
    }
}
