using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class FocoObjetivos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FocoObjetivo",
                columns: table => new
                {
                    IdFoco = table.Column<int>(type: "int", nullable: false),
                    IdPersonal = table.Column<int>(type: "int", nullable: false),
                    Clientes = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FocoObjetivo", x => new { x.IdFoco, x.IdPersonal });
                    table.ForeignKey(
                        name: "FK_FocoObjetivo_Foco_IdFoco",
                        column: x => x.IdFoco,
                        principalTable: "Foco",
                        principalColumn: "IdFoco",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FocoObjetivo");
        }
    }
}
