using AnalisisComercial.Domain;

namespace AnalisisComercial.Infrastructure;

/// <summary>Sección "Comercial" de la configuración.</summary>
public class OpcionesComercial
{
    /// <summary>La empresa de la plataforma (claim tenant_id) dueña de estos datos: Madomi Pastas.</summary>
    public Guid IdEmpresa { get; set; } = Guid.Parse("A1B2C3D4-0000-4000-8000-000000000001");

    /// <summary>Desde acá se cargan ventas (carga inicial). Antes no hay datos.</summary>
    public DateOnly PrimerMes { get; set; } = new(2026, 7, 1);

    /// <summary>Vendedores que no son personas (cuentas de la casa). null = [6] (DEPOSITO).</summary>
    public int[]? VendedoresCasa { get; set; }

    /// <summary>Documentos que cuentan como compra. null = los de <see cref="ReglaCompra.FacturasPorDefecto"/>.</summary>
    public string[]? TiposFactura { get; set; }

    /// <summary>Documentos que restan. null = los de <see cref="ReglaCompra.CreditosPorDefecto"/>.</summary>
    public string[]? TiposCredito { get; set; }

    /// <summary>Si las notas de crédito del mes pueden quitar el «compró».</summary>
    public bool NetearCreditos { get; set; } = true;

    /// <summary>Cada sincronización vuelve a leer también estos últimos días del mes anterior (correcciones tardías).</summary>
    public int DiasMesAnterior { get; set; } = 3;

    /// <summary>Meses que se muestran si el front no pide un rango.</summary>
    public int MesesPorDefecto { get; set; } = 4;

    public int MaxMeses { get; set; } = 12;

    /// <summary>Clientes excluidos: sin comprar desde hace estos días (o nunca, con esta antigüedad en la cartera) → «excluir».</summary>
    public int DiasSugerirExcluir { get; set; } = 90;

    /// <summary>Clientes excluidos: sin comprar desde hace estos días → «revisar» (también si dejó de comprar el último mes cerrado).</summary>
    public int DiasSugerirRevisar { get; set; } = 60;

    /// <summary>
    /// Si las líneas con cantidad negativa dentro de las facturas (mercadería que el vendedor retira) cuentan como
    /// devolución. Si no, solo restan de lo entregado. Ver <see cref="Volumen.Repartir"/>.
    /// </summary>
    public bool NegativasSonDevolucion { get; set; } = true;

    /// <summary>Feriados para los días hábiles de Volumen. null = <see cref="DiasHabiles.FeriadosPorDefecto"/>.</summary>
    public DateOnly[]? Feriados { get; set; }

    // El binder agrega a una lista ya inicializada en vez de reemplazarla: por eso los arreglos van en null.
    public IReadOnlySet<int> Casa() => (VendedoresCasa is { Length: > 0 } v ? v : [6]).ToHashSet();

    public IReadOnlySet<DateOnly> DiasFeriados() => Feriados is { Length: > 0 } f ? f.ToHashSet() : DiasHabiles.FeriadosPorDefecto;

    public ReglaCompra Regla()
        => new(TiposFactura is { Length: > 0 } t ? t : null, NetearCreditos, TiposCredito is { Length: > 0 } c ? c : null);
}
