import { createPortal } from 'react-dom'
import { useAnalisisFocos } from '../admin/AnalisisFocos'
import { ModalObjetivos } from '../admin/ModalObjetivos'
import type { Foco } from '../api/types'
import '../admin/admin.css'
import './editarFoco.css'

/**
 * Los objetivos por vendedor desde el resumen de la sección Focos, solo el dueño (Cesar, 17/11: «al tocar sobre editar,
 * que aparezca el total de clientes de cada uno de los vendedores y vos pongas el objetivo de cada uno»). Es el mismo
 * editor que Focos del mes: cada vendedor con su cartera y cuántos compraron. Espera el análisis del mes para arrancar
 * con los vendedores que corresponden. Con un vendedor elegido en la pantalla, arranca en el suyo. Se carga recién al
 * abrirlo.
 */
export default function EditarFoco(props: { foco: Foco; vendedor: number | null; onCerrar: () => void }) {
  const { foco, vendedor, onCerrar } = props
  const analisis = useAnalisisFocos(foco.mes, { acumulado: false, categoria: null })
  if (!analisis.a && !analisis.errores.length)
    return createPortal(
      <div className="editar-foco-cargando" role="status">
        Cargando los vendedores de {foco.nombre}…
      </div>,
      document.body,
    )
  return (
    <ModalObjetivos
      foco={foco}
      analizado={analisis.a?.focos.find((x) => x.idFoco === foco.idFoco) ?? null}
      enfocar={vendedor}
      onCerrar={onCerrar}
      onGuardado={onCerrar}
    />
  )
}
