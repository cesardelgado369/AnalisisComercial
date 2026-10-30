namespace AnalisisComercial.Domain;

/// <summary>
/// Días de visita de Chess: 1 domingo (inferido, nadie lo usa), 2 lunes, 3 martes, 4 miércoles, 5 jueves,
/// 6 viernes, 7 sábado. En rutasVenta vienen como texto separado por comas ("2,5"), a veces repetidos ("2,2").
/// </summary>
public static class DiasSemana
{
    private static readonly string[] Nombres = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    public static bool EsValido(int codigo) => codigo is >= 1 and <= 7;

    public static int DeFecha(DateOnly fecha) => (int)fecha.DayOfWeek + 1;

    public static string Nombre(int codigo) =>
        EsValido(codigo) ? Nombres[codigo - 1] : throw new ArgumentOutOfRangeException(nameof(codigo), codigo, "Día de Chess fuera de 1–7.");

    /// <summary>"2,2,5" → [2, 5]. Descarta lo que no es un día válido. Vacío o null → [].</summary>
    public static IReadOnlyList<int> Parsear(string? dias)
    {
        if (string.IsNullOrWhiteSpace(dias))
            return [];
        return dias.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(d => int.TryParse(d, out var n) ? n : 0)
            .Where(EsValido)
            .Distinct()
            .Order()
            .ToList();
    }

    /// <summary>"5,2,2" → "2,5".</summary>
    public static string Normalizar(string? dias) => string.Join(',', Parsear(dias));

    /// <summary>"2,5" → "Lunes y jueves". Vacío → "Sin día de visita".</summary>
    public static string Describir(string? dias)
    {
        var lista = Parsear(dias);
        if (lista.Count == 0)
            return "Sin día de visita";
        if (lista.Count == 6 && !lista.Contains(1))
            return "Lunes a sábado";
        var nombres = lista.Select(Nombre).ToList();
        var texto = nombres.Count == 1 ? nombres[0] : string.Join(", ", nombres[..^1]) + " y " + nombres[^1];
        return char.ToUpperInvariant(texto[0]) + texto[1..].ToLowerInvariant();
    }
}
