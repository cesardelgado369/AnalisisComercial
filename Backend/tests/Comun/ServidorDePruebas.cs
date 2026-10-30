using Microsoft.Data.SqlClient;

namespace AnalisisComercial.Pruebas;

/// <summary>
/// El SQL Server donde las pruebas crean (y borran) sus bases temporales. Por defecto, el de esta PC con la cuenta de
/// Windows. En GitHub Actions, o en otra máquina, la variable PRUEBAS_SQL trae la conexión sin base
/// («Server=localhost,1433;User ID=sa;Password=…;TrustServerCertificate=True»). Lo comparten Infrastructure.Tests y
/// Security.Tests (cada csproj lo enlaza).
/// </summary>
public static class ServidorDePruebas
{
    private const string PorDefecto = "Server=localhost;Trusted_Connection=True;TrustServerCertificate=True";

    public static string Conexion(string baseDeDatos)
        => new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PRUEBAS_SQL") is { Length: > 0 } c ? c : PorDefecto)
        {
            InitialCatalog = baseDeDatos,
        }.ConnectionString;
}
