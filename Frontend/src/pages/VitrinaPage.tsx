import { useEffect, useState } from 'react'
import '../animations/agrandar.css'
import '../animations/ola.css'
import { Modal } from '../components/Modal'
import { ModalPasos } from '../components/ModalPasos'
import { Segmentado } from '../components/Segmentado'
import { SelectorEnLinea } from '../components/SelectorEnLinea'
import { LoadingAnalisis } from '../components/loading/LoadingAnalisis'
import { LoadingDefault } from '../components/loading/LoadingDefault'
import { LoadingModal } from '../components/loading/LoadingModal'
import './vitrina.css'

/**
 * TODO testing — vitrina de los componentes genéricos copiados de De Ruta (modales, cargas, animaciones, selector en
 * línea) con la paleta violeta, y la carga larga nueva (`LoadingAnalisis`). Solo existe en desarrollo
 * (`import.meta.env.DEV`): sirve para revisarlos antes de usarlos en las pantallas. Se borra cuando estén las pantallas.
 */
export function VitrinaPage() {
  const [modal, setModal] = useState<'chico' | 'pasos' | 'largo' | null>(null)
  const [paso, setPaso] = useState(0)
  const [vista, setVista] = useState<'meses' | 'articulos'>('meses')
  const [dia, setDia] = useState<number | null>(2)

  return (
    <section className="pagina vitrina">
      <header className="encabezado">
        <div className="encabezado-textos">
          <h1>Vitrina de componentes</h1>
          <p>Las piezas genéricas de De Ruta en violeta, y la animación de carga de Análisis Comercial. Solo en desarrollo.</p>
        </div>
      </header>

      <div className="vitrina-grilla">
        <section className="config-bloque vitrina-ancha">
          <header>
            <h2>Carga larga · LoadingAnalisis</h2>
            <p className="apagado">Para esperas largas de verdad (p. ej. «Actualizar ahora» desde Chess). Ciclo de 6 s.</p>
          </header>
          <LoadingAnalisis texto="Trayendo las ventas de Chess…" detalle="Suele tardar menos de un minuto" />
        </section>

        <section className="config-bloque vitrina-oscuro">
          <header>
            <h2>Sobre fondo oscuro · una vez</h2>
            <p>Como en el panel del login: corre una vez y queda armada.</p>
          </header>
          <LoadingAnalisisRepetible />
        </section>

        <section className="config-bloque">
          <header>
            <h2>Quieta</h2>
            <p className="apagado">El dibujo terminado (también es lo que ve quien pide menos movimiento).</p>
          </header>
          <LoadingAnalisis modo="quieta" />
        </section>

        <section className="config-bloque">
          <header>
            <h2>Cargas comunes</h2>
            <p className="apagado">`LoadingDefault` en el cuerpo de una página; `LoadingModal` dentro de un modal.</p>
          </header>
          <LoadingDefault texto="Cargando clientes…" />
          <div className="vitrina-caja">
            <LoadingModal texto="Cargando la ficha…" />
          </div>
        </section>

        <section className="config-bloque">
          <header>
            <h2>Modales</h2>
            <p className="apagado">Cabecera oscura, Esc y X cierran, el foco queda adentro.</p>
          </header>
          <div className="vitrina-botones">
            <button className="btn" onClick={() => setModal('chico')}>Modal chico</button>
            <button className="btn btn-primario" onClick={() => { setPaso(0); setModal('pasos') }}>Modal con pasos</button>
            <button className="btn btn-acento" onClick={() => setModal('largo')}>
              <span className="icono icono-chico" aria-hidden>sync</span>
              Actualizar ahora
            </button>
          </div>
        </section>

        <section className="config-bloque">
          <header>
            <h2>Controles</h2>
            <p className="apagado">Segmentado, selector en línea y las animaciones al pasar el mouse.</p>
          </header>
          <Segmentado
            etiqueta="Vista de la ficha"
            valor={vista}
            opciones={[{ valor: 'meses', texto: 'Por mes' }, { valor: 'articulos', texto: 'Por artículo' }]}
            onCambio={setVista}
          />
          <div>
            Día de visita:{' '}
            <SelectorEnLinea
              texto={DIAS.find((d) => d.valor === dia)?.nombre ?? 'Todos los días'}
              titulo="Cambiar el día de visita"
              opciones={DIAS}
              actual={dia}
              onElegir={async (v) => {
                setDia(v)
                return null
              }}
            />
          </div>
          <div className="vitrina-botones">
            <span className="vitrina-ola ola">Ola (menú)</span>
            {['visibility', 'map', 'call'].map((i) => (
              <button key={i} className="vitrina-icono agrandar" title="Agrandar">
                <span className="icono">{i}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <Modal
        abierto={modal === 'chico'}
        onCerrar={() => setModal(null)}
        titulo="¿Deseás excluir a este cliente?"
        subtitulo="MINISERVICE CHUPA · Elena White"
        tamano="chico"
        pie={
          <>
            <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primario" onClick={() => setModal(null)}>Excluir</button>
          </>
        }
      >
        <p>Deja de contar en todas las carteras hasta que lo vuelvas a incluir.</p>
      </Modal>

      <ModalPasos
        abierto={modal === 'pasos'}
        onCerrar={() => setModal(null)}
        titulo="Dar acceso"
        subtitulo="Ejemplo del riel de pasos"
        tamano="mediano"
        pasos={[
          { titulo: 'Persona', icono: 'person' },
          { titulo: 'Rol', icono: 'badge' },
          { titulo: 'Vendedores', icono: 'groups' },
        ]}
        paso={paso}
        onPaso={setPaso}
        resumen={<span>Paso <strong>{paso + 1}</strong> de 3</span>}
        accionFinal={<button className="btn btn-primario" onClick={() => setModal(null)}>Dar acceso</button>}
      >
        <p className="apagado">Contenido del paso {paso + 1}.</p>
      </ModalPasos>

      {modal === 'largo' && <ModalProcesoLargo onCerrar={() => setModal(null)} />}
    </section>
  )
}

const DIAS = [
  { valor: null, nombre: 'Todos los días' },
  { valor: 2, nombre: 'Lunes' },
  { valor: 3, nombre: 'Martes' },
  { valor: 4, nombre: 'Miércoles' },
  { valor: 5, nombre: 'Jueves' },
  { valor: 6, nombre: 'Viernes' },
  { valor: 7, nombre: 'Sábado' },
]

/** La escena «una vez», con un botón para volver a correrla (se remonta con otra clave). */
function LoadingAnalisisRepetible() {
  const [vuelta, setVuelta] = useState(0)
  return (
    <>
      <LoadingAnalisis key={vuelta} modo="una-vez" sobreOscuro />
      <button className="btn vitrina-repetir" onClick={() => setVuelta((v) => v + 1)}>
        <span className="icono icono-chico" aria-hidden>replay</span>
        Repetir
      </button>
    </>
  )
}

/** Un proceso que no se puede cortar (como «Actualizar ahora»): modal sin X ni Esc, con la carga larga, 9 s de prueba. */
function ModalProcesoLargo({ onCerrar }: { onCerrar: () => void }) {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setListo(true), 9000)
    return () => clearTimeout(t)
  }, [])
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Actualizar desde Chess"
      tamano="chico"
      cerrable={listo}
      pie={listo ? <button className="btn btn-primario" onClick={onCerrar}>Cerrar</button> : undefined}
    >
      {listo ? (
        <p className="vitrina-listo">
          <span className="icono" aria-hidden>check_circle</span>
          Listo: se trajeron las ventas hasta hoy (prueba).
        </p>
      ) : (
        <LoadingAnalisis texto="Trayendo las ventas de Chess…" detalle="Podés seguir usando la app en otra pestaña" />
      )}
    </Modal>
  )
}
