namespace AnalisisComercial.Infrastructure.Tests;

/// <summary>
/// Respuestas de Chess SINTÉTICAS, con la misma forma y las mismas rarezas que las reales (relevadas el 26/10/2026
/// en diag_cartera): "" en vez de null, "0" como coordenada, "SI"/"NO", 9999-12-31, días repetidos, varias versiones
/// de una ruta, errores con HTTP 200. Sin datos reales de clientes.
/// </summary>
public static class RespuestasChess
{
    public const string Login = """{ "sessionId": "SESION-1" }""";

    public const string SinDatos = """
        { "error": [{ "route": "/ventas/", "statusCode": 404, "codigo": 1, "tipo": "E",
                      "mensaje": "No se encontro informacion con los filtros ingresados" }] }
        """;

    public const string ErrorFecha = """
        { "error": [{ "route": "/ventas/", "statusCode": 400, "codigo": 2, "tipo": "E", "mensaje": "Debe enviar una unica fecha" }] }
        """;

    public const string Personal = """
        { "PersonalComercial": { "ePersCom": [
          { "idSucursal": 1, "idPersonal": 1, "desPersonal": "VENDEDOR UNO", "apellido": null, "cargo": "VENDEDOR",
            "idPersonalSuperior": 0, "desPersonalSuperior": "", "usuarioSistema": "VEND01" },
          { "idSucursal": 1, "idPersonal": 2, "desPersonal": "VENDEDOR DOS", "cargo": "VENDEDOR", "idPersonalSuperior": 0 },
          { "idSucursal": 1, "idPersonal": 6, "desPersonal": "DEPOSITO", "cargo": "VENDEDOR", "idPersonalSuperior": 0 }
        ] } }
        """;

    public const string Rutas = """
        { "RutasVenta": { "eRutasVenta": [
          { "idRuta": 40, "desRuta": "BARRIO NORTE", "fechaDesde": "2026-05-27", "fechaHasta": "2026-09-17", "anulado": false,
            "idPersonal": 2, "desPersonal": "VENDEDOR DOS", "diasVisita": "3",
            "eClientesRutas": [{ "idCliente": 10, "razonSocial": "KIOSCO A", "intercalacionVisita": 1, "intercalacionEntrega": 0 }] },
          { "idRuta": 40, "desRuta": "BARRIO NORTE", "fechaDesde": "2026-09-18", "fechaHasta": "9999-12-31", "anulado": false,
            "idPersonal": 1, "desPersonal": "VENDEDOR UNO", "diasVisita": "2,2",
            "eClientesRutas": [
              { "idCliente": 10, "razonSocial": "KIOSCO A", "intercalacionVisita": 2, "intercalacionEntrega": 0 },
              { "idCliente": 11, "razonSocial": "DESPENSA B", "intercalacionVisita": 1, "intercalacionEntrega": 0 } ] },
          { "idRuta": 300, "desRuta": "SUPER ZONA ESTE", "fechaDesde": "2026-07-02", "fechaHasta": "9999-12-31", "anulado": false,
            "idPersonal": 2, "desPersonal": "VENDEDOR DOS", "diasVisita": "5,2",
            "eClientesRutas": [{ "idCliente": 12, "razonSocial": "SUPER C", "intercalacionVisita": 0, "intercalacionEntrega": 0 }] },
          { "idRuta": 1, "desRuta": "DEPOSITO", "fechaDesde": "2026-05-27", "fechaHasta": "9999-12-31", "anulado": false,
            "idPersonal": 6, "desPersonal": "DEPOSITO", "diasVisita": "2,3,4,5,6,7",
            "eClientesRutas": [{ "idCliente": 13, "razonSocial": "CASA D", "intercalacionVisita": 0, "intercalacionEntrega": 0 }] },
          { "idRuta": 250, "desRuta": "SUR TUCUMAN", "fechaDesde": "2026-05-27", "fechaHasta": "9999-12-31", "anulado": false,
            "idPersonal": 0, "desPersonal": "", "diasVisita": "" },
          { "idRuta": 5, "desRuta": "TEST", "fechaDesde": "2024-03-04", "fechaHasta": "2026-05-26", "anulado": false,
            "idPersonal": 0, "desPersonal": "", "diasVisita": "",
            "eClientesRutas": [{ "idCliente": 1, "razonSocial": "CLIENTE TEST", "intercalacionVisita": 0, "intercalacionEntrega": 0 }] }
        ] } }
        """;

    public static string Clientes(int lote, int totalLotes, params int[] ids) => $$"""
        { "Clientes": { "eClientes": [ {{string.Join(",", ids.Select(Cliente))}} ] },
          "cantClientes": "Numero de lote obtenido: {{lote}}/{{totalLotes}}. Cantidad de clientes totales: 1305" }
        """;

    private static string Cliente(int id) => id switch
    {
        // Sin coordenada propia ("0"), con la de entrega sin punto decimal; alias sin razón social → fantasía.
        11 => """
            { "idCliente": 11, "anulado": false, "fechaBaja": "9999-12-31", "desLocalidad": "SAN MIGUEL DE TUCUMAN",
              "calle": "AV. SIEMPRE VIVA", "altura": 0, "latitudGeo": "0", "longitudGeo": "0",
              "latitudGeoEntrega": "-2678773", "longitudGeoEntrega": "-6518363", "horario": 0,
              "eClialias": [{ "idCliente": 11, "razonSocial": "", "fantasiaSocial": "DESPENSA B" }],
              "eClifuerza": [
                { "idCliente": 11, "idRuta": 40, "fechaInicioFuerza": "2026-06-01", "fechaFinFuerza": "2026-06-25", "anulado": false },
                { "idCliente": 11, "idRuta": 41, "fechaInicioFuerza": "2026-06-26", "fechaFinFuerza": "2026-09-17", "anulado": false },
                { "idCliente": 11, "idRuta": 43, "fechaInicioFuerza": "2026-09-18", "fechaFinFuerza": "9999-12-31", "anulado": false } ] }
            """,
        // Dado de baja, anulado.
        99 => """
            { "idCliente": 99, "anulado": true, "fechaBaja": "2026-08-31", "desLocalidad": "", "calle": "", "altura": 120,
              "latitudGeo": "-26.840023", "longitudGeo": "-65.25097",
              "eClialias": [{ "idCliente": 99, "razonSocial": "CERRADO E", "fantasiaSocial": "" }], "eClifuerza": [] }
            """,
        _ => $$"""
            { "idCliente": {{id}}, "anulado": false, "fechaBaja": "9999-12-31", "desLocalidad": "YERBA BUENA",
              "calle": "ACONQUIJA", "altura": 1500, "latitudGeo": "-26.787739", "longitudGeo": "-65.18363",
              "eClialias": [{ "idCliente": {{id}}, "razonSocial": "CLIENTE {{id}}", "fantasiaSocial": "" }],
              "eClifuerza": [{ "idCliente": {{id}}, "idRuta": 40, "fechaInicioFuerza": "2026-05-27", "fechaFinFuerza": "9999-12-31", "anulado": false }] }
            """,
    };

    public const string Articulos = """
        { "Articulos": { "eArticulos": [
          { "idArticulo": 101, "desArticulo": "TALLARIN AL HUEVO 500G", "anulado": false, "unidadesBulto": 12, "pesoBulto": 6.0,
            "eAgrupaciones": [{ "idFormaAgrupar": 124, "idAgrupacion": 3, "desAgrupacion": "PASTAS FRESCAS" }] },
          { "idArticulo": 102, "desArticulo": "TAPA EMPANADA X12", "anulado": true, "unidadesBulto": 20, "pesoBulto": 4.5 }
        ] } }
        """;

    /// <summary>Líneas de ventas/ detallado (campos de 09_ventas_detalle.md).</summary>
    public static string Ventas(int lote, int totalLotes, params string[] lineas) => $$"""
        { "dsReporteComprobantesApi": { "VentasResumen": [ {{string.Join(",", lineas)}} ] },
          "cantComprobantesVentas": "Numero de lote obtenido: {{lote}}/{{totalLotes}}. Cantidad de comprobantes totales: 2097" }
        """;

    public static string Linea(int nrodoc, int idLinea, string documento = "FACTURA", string anulado = "NO",
        string fecha = "2026-10-01", int cliente = 10, int articulo = 101, string cantidad = "3") => $$"""
        { "idEmpresa": 1, "idDocumento": "FCVTA", "dsDocumento": "{{documento}}", "letra": "A", "serie": 17, "nrodoc": {{nrodoc}},
          "anulado": "{{anulado}}", "fechaComprobate": "{{fecha}}", "fechaEntrega": "", "idSucursal": 1, "idFuerzaVentas": 1,
          "idVendedor": 2, "dsVendedor": "VENDEDOR DOS", "idCliente": {{cliente}}, "nombreCliente": "KIOSCO A",
          "idLinea": {{idLinea}}, "idArticulo": {{articulo}}, "dsArticulo": "TALLARIN AL HUEVO 500G",
          "cantidadesTotal": {{cantidad}}, "cantidadesSinCargo": 1, "cantidadesRechazo": 0, "pesoTotal": 18.5,
          "subtotalNeto": 12345.67, "subtotalFinal": 14938.26 }
        """;
}
