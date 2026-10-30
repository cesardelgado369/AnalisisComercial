using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class OperarioConVariosVendedores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // El vendedor del operario pasa a la lista de vendedores del acceso (la misma del supervisor) antes de borrar
            // la columna: ningún acceso ya cargado se queda sin vendedor.
            migrationBuilder.Sql("""
                INSERT INTO AccesoVendedor (IdAcceso, IdPersonal)
                SELECT a.IdAcceso, a.IdPersonal FROM AccesoUsuario a
                WHERE a.IdPersonal IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM AccesoVendedor v WHERE v.IdAcceso = a.IdAcceso AND v.IdPersonal = a.IdPersonal);
                """);

            migrationBuilder.DropColumn(
                name: "IdPersonal",
                table: "AccesoUsuario");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "IdPersonal",
                table: "AccesoUsuario",
                type: "int",
                nullable: true);

            // Vuelta atrás: el operario se queda con el primero de sus vendedores.
            migrationBuilder.Sql("""
                UPDATE a SET IdPersonal = (SELECT MIN(v.IdPersonal) FROM AccesoVendedor v WHERE v.IdAcceso = a.IdAcceso)
                FROM AccesoUsuario a WHERE a.Rol = 2;
                DELETE v FROM AccesoVendedor v JOIN AccesoUsuario a ON a.IdAcceso = v.IdAcceso WHERE a.Rol = 2;
                """);
        }
    }
}
