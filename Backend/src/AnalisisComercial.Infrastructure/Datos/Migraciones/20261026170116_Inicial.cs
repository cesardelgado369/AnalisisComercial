using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AnalisisComercial.Infrastructure.Datos.Migraciones
{
    /// <inheritdoc />
    public partial class Inicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccesoLog",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IdUsuario = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Pantalla = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Parametros = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Denegado = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccesoLog", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AccesoUsuario",
                columns: table => new
                {
                    IdAcceso = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Email = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Nombre = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Rol = table.Column<byte>(type: "tinyint", nullable: false),
                    IdPersonal = table.Column<int>(type: "int", nullable: true),
                    Activo = table.Column<bool>(type: "bit", nullable: false),
                    IdUsuario = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActualizadoPor = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Actualizado = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccesoUsuario", x => x.IdAcceso);
                });

            migrationBuilder.CreateTable(
                name: "Articulo",
                columns: table => new
                {
                    IdArticulo = table.Column<int>(type: "int", nullable: false),
                    Descripcion = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    UnidadNegocio = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    AgrupacionesJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Anulado = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Articulo", x => x.IdArticulo);
                });

            migrationBuilder.CreateTable(
                name: "CarteraMes",
                columns: table => new
                {
                    Mes = table.Column<DateOnly>(type: "date", nullable: false),
                    IdCliente = table.Column<int>(type: "int", nullable: false),
                    IdRuta = table.Column<int>(type: "int", nullable: false),
                    IdPersonal = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CarteraMes", x => new { x.Mes, x.IdCliente });
                });

            migrationBuilder.CreateTable(
                name: "Cliente",
                columns: table => new
                {
                    IdCliente = table.Column<int>(type: "int", nullable: false),
                    RazonSocial = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Localidad = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Calle = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    Altura = table.Column<int>(type: "int", nullable: true),
                    Lat = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    Lng = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    IdRuta = table.Column<int>(type: "int", nullable: true),
                    OrdenVisita = table.Column<int>(type: "int", nullable: true),
                    Anulado = table.Column<bool>(type: "bit", nullable: false),
                    FechaBaja = table.Column<DateOnly>(type: "date", nullable: true),
                    EnChess = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cliente", x => x.IdCliente);
                });

            migrationBuilder.CreateTable(
                name: "CompraMes",
                columns: table => new
                {
                    Mes = table.Column<DateOnly>(type: "date", nullable: false),
                    IdCliente = table.Column<int>(type: "int", nullable: false),
                    IdArticulo = table.Column<int>(type: "int", nullable: false),
                    Compro = table.Column<bool>(type: "bit", nullable: false),
                    Cantidad = table.Column<decimal>(type: "decimal(18,3)", precision: 18, scale: 3, nullable: false),
                    Neto = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompraMes", x => new { x.Mes, x.IdCliente, x.IdArticulo });
                });

            migrationBuilder.CreateTable(
                name: "Exclusion",
                columns: table => new
                {
                    IdCliente = table.Column<int>(type: "int", nullable: false),
                    Motivo = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreadoPor = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreadoEn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Exclusion", x => x.IdCliente);
                });

            migrationBuilder.CreateTable(
                name: "Ruta",
                columns: table => new
                {
                    IdRuta = table.Column<int>(type: "int", nullable: false),
                    Nombre = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IdPersonal = table.Column<int>(type: "int", nullable: true),
                    DiasVisita = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Vigente = table.Column<bool>(type: "bit", nullable: false),
                    FechaDesde = table.Column<DateOnly>(type: "date", nullable: false),
                    FechaHasta = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Ruta", x => x.IdRuta);
                });

            migrationBuilder.CreateTable(
                name: "SyncLog",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IdCorrida = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Inicio = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Fin = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Endpoint = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Desde = table.Column<DateOnly>(type: "date", nullable: true),
                    Hasta = table.Column<DateOnly>(type: "date", nullable: true),
                    Registros = table.Column<int>(type: "int", nullable: false),
                    Ok = table.Column<bool>(type: "bit", nullable: false),
                    Error = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncLog", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SyncSolicitud",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SolicitadoPor = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SolicitadoEn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    TomadoEn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncSolicitud", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vendedor",
                columns: table => new
                {
                    IdPersonal = table.Column<int>(type: "int", nullable: false),
                    Nombre = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    EsPersona = table.Column<bool>(type: "bit", nullable: false),
                    Activo = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vendedor", x => x.IdPersonal);
                });

            migrationBuilder.CreateTable(
                name: "VentaLinea",
                columns: table => new
                {
                    IdEmpresa = table.Column<int>(type: "int", nullable: false),
                    IdDocumento = table.Column<string>(type: "varchar(10)", unicode: false, maxLength: 10, nullable: false),
                    Letra = table.Column<string>(type: "varchar(2)", unicode: false, maxLength: 2, nullable: false),
                    Serie = table.Column<int>(type: "int", nullable: false),
                    NroDoc = table.Column<long>(type: "bigint", nullable: false),
                    IdLinea = table.Column<int>(type: "int", nullable: false),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    FechaEntrega = table.Column<DateOnly>(type: "date", nullable: true),
                    IdCliente = table.Column<int>(type: "int", nullable: false),
                    IdArticulo = table.Column<int>(type: "int", nullable: false),
                    IdVendedor = table.Column<int>(type: "int", nullable: false),
                    TipoDocumento = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Anulado = table.Column<bool>(type: "bit", nullable: false),
                    CantidadTotal = table.Column<decimal>(type: "decimal(18,3)", precision: 18, scale: 3, nullable: false),
                    CantidadRechazo = table.Column<decimal>(type: "decimal(18,3)", precision: 18, scale: 3, nullable: false),
                    Kilos = table.Column<decimal>(type: "decimal(18,3)", precision: 18, scale: 3, nullable: false),
                    Neto = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Final = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VentaLinea", x => new { x.IdEmpresa, x.IdDocumento, x.Letra, x.Serie, x.NroDoc, x.IdLinea });
                });

            migrationBuilder.CreateTable(
                name: "AccesoVendedor",
                columns: table => new
                {
                    IdAcceso = table.Column<int>(type: "int", nullable: false),
                    IdPersonal = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccesoVendedor", x => new { x.IdAcceso, x.IdPersonal });
                    table.ForeignKey(
                        name: "FK_AccesoVendedor_AccesoUsuario_IdAcceso",
                        column: x => x.IdAcceso,
                        principalTable: "AccesoUsuario",
                        principalColumn: "IdAcceso",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RutaDia",
                columns: table => new
                {
                    IdRuta = table.Column<int>(type: "int", nullable: false),
                    DiaSemana = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RutaDia", x => new { x.IdRuta, x.DiaSemana });
                    table.ForeignKey(
                        name: "FK_RutaDia_Ruta_IdRuta",
                        column: x => x.IdRuta,
                        principalTable: "Ruta",
                        principalColumn: "IdRuta",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccesoLog_Fecha",
                table: "AccesoLog",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_AccesoUsuario_Email",
                table: "AccesoUsuario",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AccesoUsuario_IdUsuario",
                table: "AccesoUsuario",
                column: "IdUsuario",
                unique: true,
                filter: "[IdUsuario] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CarteraMes_Mes_IdPersonal",
                table: "CarteraMes",
                columns: new[] { "Mes", "IdPersonal" });

            migrationBuilder.CreateIndex(
                name: "IX_Cliente_IdRuta",
                table: "Cliente",
                column: "IdRuta");

            migrationBuilder.CreateIndex(
                name: "IX_CompraMes_IdCliente_Mes",
                table: "CompraMes",
                columns: new[] { "IdCliente", "Mes" });

            migrationBuilder.CreateIndex(
                name: "IX_Ruta_IdPersonal",
                table: "Ruta",
                column: "IdPersonal");

            migrationBuilder.CreateIndex(
                name: "IX_SyncLog_Inicio",
                table: "SyncLog",
                column: "Inicio");

            migrationBuilder.CreateIndex(
                name: "IX_VentaLinea_Fecha_IdCliente",
                table: "VentaLinea",
                columns: new[] { "Fecha", "IdCliente" });

            migrationBuilder.CreateIndex(
                name: "IX_VentaLinea_IdCliente",
                table: "VentaLinea",
                column: "IdCliente");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AccesoLog");

            migrationBuilder.DropTable(
                name: "AccesoVendedor");

            migrationBuilder.DropTable(
                name: "Articulo");

            migrationBuilder.DropTable(
                name: "CarteraMes");

            migrationBuilder.DropTable(
                name: "Cliente");

            migrationBuilder.DropTable(
                name: "CompraMes");

            migrationBuilder.DropTable(
                name: "Exclusion");

            migrationBuilder.DropTable(
                name: "RutaDia");

            migrationBuilder.DropTable(
                name: "SyncLog");

            migrationBuilder.DropTable(
                name: "SyncSolicitud");

            migrationBuilder.DropTable(
                name: "Vendedor");

            migrationBuilder.DropTable(
                name: "VentaLinea");

            migrationBuilder.DropTable(
                name: "AccesoUsuario");

            migrationBuilder.DropTable(
                name: "Ruta");
        }
    }
}
