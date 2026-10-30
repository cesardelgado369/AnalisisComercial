namespace AnalisisComercial.Application;

// Se traducen a HTTP en la API (ManejoDeErrores): { status, title, errors?, traceId }.

/// <summary>400 con <c>errors[Campo]</c>.</summary>
public class ValidacionException(string campo, string mensaje) : Exception(mensaje)
{
    public string Campo { get; } = campo;
}

/// <summary>404. También para lo que está fuera del alcance: no se revela que existe.</summary>
public class NoEncontradoException(string mensaje) : Exception(mensaje);

/// <summary>403: sin acceso a la app o pidió un vendedor fuera de su alcance.</summary>
public class AccesoDenegadoException(string mensaje) : Exception(mensaje)
{
    public const string SinAcceso = "Todavía no tenés acceso a Análisis Comercial. Pedíselo al administrador.";
}

/// <summary>409: otro guardó en el medio, o ya existe.</summary>
public class ConflictoException(string mensaje) : Exception(mensaje);
