using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class AccesoLogCanalEmpresa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Canal",
                table: "AccesoLog",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "IdEmpresa",
                table: "AccesoLog",
                type: "uniqueidentifier",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Canal",
                table: "AccesoLog");

            migrationBuilder.DropColumn(
                name: "IdEmpresa",
                table: "AccesoLog");
        }
    }
}
