using AnalisisComercial.Application;
using AnalisisComercial.Infrastructure.Chess;
using AnalisisComercial.Infrastructure.Datos;
using AnalisisComercial.Infrastructure.Plataforma;
using AnalisisComercial.Infrastructure.Servicios;
using AnalisisComercial.Infrastructure.Sincronizacion;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// La base, los servicios del contrato y la lectura de Chess. La API suma la autenticación (IUsuarioActual) y el
    /// proceso de sincronización corre <see cref="Sincronizador"/>.
    /// </summary>
    public static IServiceCollection AddInfraestructura(this IServiceCollection services, IConfiguration configuration)
    {
        var conexion = configuration.GetConnectionString("Comercial")
                       ?? throw new InvalidOperationException("Falta ConnectionStrings:Comercial.");
        services.AddDbContext<ComercialDbContext>(o => o.UseSqlServer(conexion, sql => sql.CommandTimeout(120)));

        services.Configure<OpcionesComercial>(configuration.GetSection("Comercial"));
        services.Configure<OpcionesChess>(configuration.GetSection("Chess"));
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<IReloj, RelojArgentina>();

        services.AddScoped<IAlcanceUsuario, AlcanceUsuario>();
        services.AddScoped<Lectura>();
        services.AddScoped<ISesionService, SesionService>();
        services.AddScoped<ICoberturaService, CoberturaService>();
        services.AddScoped<IClienteService, ClienteService>();
        services.AddScoped<IRutaHoyService, RutaHoyService>();
        services.AddScoped<IResumenService, ResumenService>();
        services.AddScoped<IVolumenService, VolumenService>();
        services.AddScoped<IDevolucionesService, DevolucionesService>();
        services.AddScoped<IAdminService, AdminService>();

        services.AddSingleton<SesionChess>();
        services.AddHttpClient<IChess, ChessClient>((sp, http) =>
        {
            var op = sp.GetRequiredService<IOptions<OpcionesChess>>().Value;
            http.BaseAddress = new Uri(op.BaseUrl.EndsWith('/') ? op.BaseUrl : op.BaseUrl + "/");
            http.Timeout = TimeSpan.FromSeconds(op.TimeoutSegundos);
        });
        services.AddScoped<Sincronizador>();

        services.Configure<OpcionesPlataforma>(configuration.GetSection("Plataforma"));
        services.AddHttpClient<IPlataforma, PlataformaClient>((sp, http)
            => http.Timeout = TimeSpan.FromSeconds(sp.GetRequiredService<IOptions<OpcionesPlataforma>>().Value.TimeoutSegundos));
        return services;
    }
}
