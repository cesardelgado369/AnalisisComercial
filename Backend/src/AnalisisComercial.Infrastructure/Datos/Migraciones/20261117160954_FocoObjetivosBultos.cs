using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class FocoObjetivosBultos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "Clientes",
                table: "FocoObjetivo",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<decimal>(
                name: "Bultos",
                table: "FocoObjetivo",
                type: "decimal(9,1)",
                precision: 9,
                scale: 1,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Bultos",
                table: "FocoObjetivo");

            migrationBuilder.AlterColumn<int>(
                name: "Clientes",
                table: "FocoObjetivo",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
