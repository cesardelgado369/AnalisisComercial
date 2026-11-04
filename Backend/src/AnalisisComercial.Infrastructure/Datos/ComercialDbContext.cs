using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Infrastructure.Datos;

/// <summary>
/// Base propia (SQL Server). El espejo de Chess (vendedores, rutas, clientes, artículos, ventas) lo escribe solo la
/// sincronización; las derivadas (CompraMes, CarteraMes) se recalculan en cada corrida. La configuración (accesos,
/// exclusiones) la carga el Admin. Esquema por migraciones de EF (`Datos/Migraciones`).
/// </summary>
public class ComercialDbContext(DbContextOptions<ComercialDbContext> options) : DbContext(options)
{
    public DbSet<Vendedor> Vendedores => Set<Vendedor>();
    public DbSet<Ruta> Rutas => Set<Ruta>();
    public DbSet<RutaDia> RutaDias => Set<RutaDia>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Articulo> Articulos => Set<Articulo>();
    public DbSet<VentaLinea> VentaLineas => Set<VentaLinea>();
    public DbSet<CompraMes> ComprasMes => Set<CompraMes>();
    public DbSet<CarteraMes> CarterasMes => Set<CarteraMes>();
    public DbSet<AccesoUsuario> Accesos => Set<AccesoUsuario>();
    public DbSet<AccesoVendedor> AccesoVendedores => Set<AccesoVendedor>();
    public DbSet<Exclusion> Exclusiones => Set<Exclusion>();
    public DbSet<ClienteVital> Vitales => Set<ClienteVital>();
    public DbSet<SyncLog> SyncLogs => Set<SyncLog>();
    public DbSet<SyncSolicitud> SyncSolicitudes => Set<SyncSolicitud>();
    public DbSet<AccesoLog> AccesoLogs => Set<AccesoLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Vendedor>(e =>
        {
            e.ToTable("Vendedor");
            e.HasKey(x => x.IdPersonal);
            e.Property(x => x.IdPersonal).ValueGeneratedNever();
            e.Property(x => x.Nombre).HasMaxLength(100);
        });

        b.Entity<Ruta>(e =>
        {
            e.ToTable("Ruta");
            e.HasKey(x => x.IdRuta);
            e.Property(x => x.IdRuta).ValueGeneratedNever();
            e.Property(x => x.Nombre).HasMaxLength(100);
            e.Property(x => x.DiasVisita).HasMaxLength(20);
            e.HasMany(x => x.Dias).WithOne().HasForeignKey(x => x.IdRuta).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.IdPersonal);
        });

        b.Entity<RutaDia>(e =>
        {
            e.ToTable("RutaDia");
            e.HasKey(x => new { x.IdRuta, x.DiaSemana });
        });

        b.Entity<Cliente>(e =>
        {
            e.ToTable("Cliente");
            e.HasKey(x => x.IdCliente);
            e.Property(x => x.IdCliente).ValueGeneratedNever();
            e.Property(x => x.RazonSocial).HasMaxLength(200);
            e.Property(x => x.Localidad).HasMaxLength(100);
            e.Property(x => x.Calle).HasMaxLength(150);
            e.Property(x => x.Lat).HasPrecision(9, 6);
            e.Property(x => x.Lng).HasPrecision(9, 6);
            e.HasIndex(x => x.IdRuta);
        });

        b.Entity<Articulo>(e =>
        {
            e.ToTable("Articulo");
            e.HasKey(x => x.IdArticulo);
            e.Property(x => x.IdArticulo).ValueGeneratedNever();
            e.Property(x => x.Descripcion).HasMaxLength(200);
            e.Property(x => x.UnidadNegocio).HasMaxLength(100);
            e.Property(x => x.UnidadesBulto).HasPrecision(18, 3);
        });

        b.Entity<VentaLinea>(e =>
        {
            e.ToTable("VentaLinea");
            e.HasKey(x => new { x.IdEmpresa, x.IdDocumento, x.Letra, x.Serie, x.NroDoc, x.IdLinea });
            e.Property(x => x.IdDocumento).HasMaxLength(10).IsUnicode(false);
            e.Property(x => x.Letra).HasMaxLength(2).IsUnicode(false);
            e.Property(x => x.TipoDocumento).HasMaxLength(60);
            foreach (var p in new[] { nameof(VentaLinea.CantidadTotal), nameof(VentaLinea.CantidadRechazo),
                         nameof(VentaLinea.CantidadSinCargo), nameof(VentaLinea.Kilos) })
                e.Property(p).HasPrecision(18, 3);
            e.Property(x => x.Neto).HasPrecision(18, 2);
            e.Property(x => x.Final).HasPrecision(18, 2);
            e.HasIndex(x => new { x.Fecha, x.IdCliente });
            e.HasIndex(x => x.IdCliente);
        });

        b.Entity<CompraMes>(e =>
        {
            e.ToTable("CompraMes");
            e.HasKey(x => new { x.Mes, x.IdCliente, x.IdArticulo });
            e.Property(x => x.Cantidad).HasPrecision(18, 3);
            e.Property(x => x.Neto).HasPrecision(18, 2);
            e.HasIndex(x => new { x.IdCliente, x.Mes });
        });

        b.Entity<CarteraMes>(e =>
        {
            e.ToTable("CarteraMes");
            e.HasKey(x => new { x.Mes, x.IdCliente });
            e.HasIndex(x => new { x.Mes, x.IdPersonal });
        });

        b.Entity<AccesoUsuario>(e =>
        {
            e.ToTable("AccesoUsuario");
            e.HasKey(x => x.IdAcceso);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.Nombre).HasMaxLength(100);
            e.Property(x => x.Rol).HasConversion<byte>();
            e.Property(x => x.ActualizadoPor).HasMaxLength(200);
            e.Property(x => x.Version).IsConcurrencyToken();
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.IdUsuario).IsUnique().HasFilter("[IdUsuario] IS NOT NULL");
            e.HasMany(x => x.Vendedores).WithOne().HasForeignKey(x => x.IdAcceso).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<AccesoVendedor>(e =>
        {
            e.ToTable("AccesoVendedor");
            e.HasKey(x => new { x.IdAcceso, x.IdPersonal });
        });

        b.Entity<Exclusion>(e =>
        {
            e.ToTable("Exclusion");
            e.HasKey(x => x.IdCliente);
            e.Property(x => x.IdCliente).ValueGeneratedNever();
            e.Property(x => x.Motivo).HasMaxLength(200);
            e.Property(x => x.CreadoPor).HasMaxLength(200);
        });

        b.Entity<ClienteVital>(e =>
        {
            e.ToTable("ClienteVital");
            e.HasKey(x => x.IdCliente);
            e.Property(x => x.IdCliente).ValueGeneratedNever();
            e.Property(x => x.MarcadoPor).HasMaxLength(200);
        });

        b.Entity<SyncLog>(e =>
        {
            e.ToTable("SyncLog");
            e.HasKey(x => x.Id);
            e.Property(x => x.Endpoint).HasMaxLength(60);
            e.Property(x => x.Error).HasMaxLength(2000);
            e.HasIndex(x => x.Inicio);
        });

        b.Entity<SyncSolicitud>(e =>
        {
            e.ToTable("SyncSolicitud");
            e.HasKey(x => x.Id);
            e.Property(x => x.SolicitadoPor).HasMaxLength(200);
        });

        b.Entity<AccesoLog>(e =>
        {
            e.ToTable("AccesoLog");
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.Pantalla).HasMaxLength(60);
            e.Property(x => x.Parametros).HasMaxLength(500);
            e.Property(x => x.Canal).HasMaxLength(20);
            e.HasIndex(x => x.Fecha);
        });
    }

    /// <summary>Guarda y traduce la concurrencia y las claves duplicadas a <see cref="ConflictoException"/> (409).</summary>
    public async Task GuardarAsync(CancellationToken ct = default)
    {
        try
        {
            await SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictoException("Otra persona lo cambió mientras lo editabas. Volvé a cargarlo.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
        {
            throw new ConflictoException("Ya existe.");
        }
    }
}
