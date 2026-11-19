using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class AccesoTodosLosVendedores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "TodosLosVendedores",
                table: "AccesoUsuario",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TodosLosVendedores",
                table: "AccesoUsuario");
        }
    }
}
