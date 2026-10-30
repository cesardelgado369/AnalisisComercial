import { useAuth } from '../auth/AuthContext'
import madomi from './madomi.png'

/**
 * La empresa con la que se entró (`usuario.empresa` del login central). La app es de Madomi Pastas, así que va su
 * logo (la versión estilizada en blanco y negro que pasó Cesar el 30/10, achicada a 283×120: el triple de los 40 px de
 * la cabecera); para cualquier otra, el nombre en texto.
 * TODO: cuando la plataforma mande el logo de cada empresa, se usa ese.
 */
export function LogoEmpresa() {
  const { usuario } = useAuth()
  const empresa = usuario?.empresa ?? 'Vignoli'
  if (/madomi/i.test(empresa)) return <img className="logo-cabecera" src={madomi} alt={empresa} />
  return <span className="logo-texto">{empresa}</span>
}
