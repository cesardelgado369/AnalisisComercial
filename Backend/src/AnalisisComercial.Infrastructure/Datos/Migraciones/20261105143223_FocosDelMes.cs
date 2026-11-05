using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class FocosDelMes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Division",
                table: "Articulo",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            // La DIVISION de los artículos ya cargados, desde las agrupaciones guardadas (la sincronización la sigue
            // poniendo en cada corrida).
            migrationBuilder.Sql("""
                UPDATE Articulo SET Division =
                    (SELECT TOP 1 JSON_VALUE(j.value, '$.desAgrupacion') FROM OPENJSON(AgrupacionesJson) j
                     WHERE UPPER(LTRIM(RTRIM(COALESCE(JSON_VALUE(j.value, '$.idFormaAgrupar'), JSON_VALUE(j.value, '$.desFormaAgrupar'))))) = 'DIVISION')
                WHERE ISJSON(AgrupacionesJson) = 1;
                """);

            migrationBuilder.CreateTable(
                name: "Foco",
                columns: table => new
                {
                    IdFoco = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Mes = table.Column<DateOnly>(type: "date", nullable: false),
                    Nombre = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    ActualizadoPor = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Actualizado = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Foco", x => x.IdFoco);
                });

            migrationBuilder.CreateTable(
                name: "FocoArticulo",
                columns: table => new
                {
                    IdFoco = table.Column<int>(type: "int", nullable: false),
                    IdArticulo = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FocoArticulo", x => new { x.IdFoco, x.IdArticulo });
                    table.ForeignKey(
                        name: "FK_FocoArticulo_Foco_IdFoco",
                        column: x => x.IdFoco,
                        principalTable: "Foco",
                        principalColumn: "IdFoco",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Foco_Mes_Nombre",
                table: "Foco",
                columns: new[] { "Mes", "Nombre" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FocoArticulo");

            migrationBuilder.DropTable(
                name: "Foco");

            migrationBuilder.DropColumn(
                name: "Division",
                table: "Articulo");
        }
    }
}
