'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

/**
 * Datos que la memoria necesita y que no salen de la contabilidad: los de la
 * sociedad (se guardan una vez, en la configuracion legal) y las notas de cada
 * ejercicio (plantilla media, partes vinculadas...). Arriba, lo que falta.
 */

interface Sociedad {
  denominacion: string;
  nif: string;
  tipoSociedad: string;
  domicilioSocial: string;
  codigoPostal: string;
  municipio: string;
  provincia: string;
  actividad: string;
  cnae: string;
  registroMercantilProvincia: string;
  datosRegistrales: string;
  fechaConstitucion: string;
}

interface Notas {
  plantillaMedia: string;
  plantillaMediaHombres: string;
  plantillaMediaMujeres: string;
  periodoMedioPago: string;
  remuneracionAdministradores: string;
  partesVinculadas: string;
  hechosPosteriores: string;
  otraInformacion: string;
}

const SOCIEDAD_VACIA: Sociedad = {
  denominacion: '',
  nif: '',
  tipoSociedad: 'SL',
  domicilioSocial: '',
  codigoPostal: '',
  municipio: '',
  provincia: '',
  actividad: '',
  cnae: '',
  registroMercantilProvincia: '',
  datosRegistrales: '',
  fechaConstitucion: '',
};

const NOTAS_VACIAS: Notas = {
  plantillaMedia: '',
  plantillaMediaHombres: '',
  plantillaMediaMujeres: '',
  periodoMedioPago: '',
  remuneracionAdministradores: '',
  partesVinculadas: '',
  hechosPosteriores: '',
  otraInformacion: '',
};

const aTexto = (v: unknown) => (v === null || v === undefined ? '' : String(v));

const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

function Campo({
  id,
  label,
  valor,
  onChange,
  tipo = 'text',
  ayuda,
  area = false,
  disabled,
  ancho = '',
}: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  ayuda?: string;
  area?: boolean;
  disabled?: boolean;
  ancho?: string;
}) {
  return (
    <div className={ancho}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      {area ? (
        <textarea id={id} value={valor} onChange={(e) => onChange(e.target.value)} rows={3} className={campo} disabled={disabled} />
      ) : (
        <input id={id} type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} className={campo} disabled={disabled} />
      )}
      {ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}

export function DatosMemoria({ fyId, ejercicio, puedeEditar }: { fyId: string; ejercicio: string; puedeEditar: boolean }) {
  const [sociedad, setSociedad] = useState<Sociedad>(SOCIEDAD_VACIA);
  const [notas, setNotas] = useState<Notas>(NOTAS_VACIAS);
  const [pendientes, setPendientes] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const [cfg, mem] = await Promise.all([
      apiFetch<Record<string, unknown>>(companyPath('/legal-config')),
      apiFetch<{ notas: Record<string, unknown>; pendientes: string[] }>(`/fiscal-years/${fyId}/memoria`),
    ]);
    setSociedad(Object.fromEntries(Object.keys(SOCIEDAD_VACIA).map((k) => [k, aTexto(cfg[k]) || SOCIEDAD_VACIA[k as keyof Sociedad]])) as unknown as Sociedad);
    setNotas(Object.fromEntries(Object.keys(NOTAS_VACIAS).map((k) => [k, aTexto(mem.notas?.[k])])) as unknown as Notas);
    setPendientes(mem.pendientes);
  }, [fyId]);

  useEffect(() => {
    setCargando(true);
    setMensaje(null);
    cargar()
      .catch((e) => setMensaje({ ok: false, texto: errorMessage(e) }))
      .finally(() => setCargando(false));
  }, [cargar]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      await apiFetch(companyPath('/legal-config'), { method: 'PUT', body: JSON.stringify(sociedad) });
      const r = await apiFetch<{ pendientes: string[] }>(`/fiscal-years/${fyId}/memoria`, { method: 'PUT', body: JSON.stringify(notas) });
      setPendientes(r.pendientes);
      setMensaje({ ok: true, texto: 'Datos guardados. Se usarán la próxima vez que generes las cuentas anuales.' });
    } catch (err) {
      setMensaje({ ok: false, texto: errorMessage(err) });
    } finally {
      setGuardando(false);
    }
  };

  const s = (k: keyof Sociedad) => (v: string) => setSociedad((x) => ({ ...x, [k]: v }));
  const nn = (k: keyof Notas) => (v: string) => setNotas((x) => ({ ...x, [k]: v }));
  const off = !puedeEditar || guardando;

  if (cargando) return <p className="px-5 py-4 text-sm text-slate-500">Cargando datos de la memoria...</p>;

  return (
    <form onSubmit={guardar} className="space-y-6 px-5 py-4">
      {pendientes &&
        (pendientes.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle size={18} /> La memoria tiene todos los datos.
          </p>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-medium">
              <WarningCircle size={18} /> Faltan {pendientes.length} datos para completar la memoria:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6">
              {pendientes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">En el PDF aparecen marcados como [PENDIENTE].</p>
          </div>
        ))}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Datos de la sociedad</legend>
        <p className="text-xs text-slate-500">Se guardan una sola vez y sirven para todos los ejercicios.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Campo id="m-denominacion" label="Denominación social" valor={sociedad.denominacion} onChange={s('denominacion')} disabled={off} ancho="md:col-span-4" />
          <Campo id="m-nif" label="NIF" valor={sociedad.nif} onChange={s('nif')} disabled={off} ancho="md:col-span-2" />
          <div className="md:col-span-2">
            <label htmlFor="m-tipo" className="block text-sm font-medium text-slate-700">Forma jurídica</label>
            <select id="m-tipo" value={sociedad.tipoSociedad} onChange={(e) => s('tipoSociedad')(e.target.value)} className={campo} disabled={off}>
              <option value="SL">Sociedad limitada</option>
              <option value="SLU">Sociedad limitada unipersonal</option>
              <option value="SA">Sociedad anónima</option>
              <option value="SCP">Sociedad civil</option>
              <option value="OTRA">Otra</option>
            </select>
          </div>
          <Campo id="m-constitucion" label="Fecha de constitución" tipo="date" valor={sociedad.fechaConstitucion} onChange={s('fechaConstitucion')} disabled={off} ancho="md:col-span-2" />
          <Campo id="m-cnae" label="CNAE-2025" valor={sociedad.cnae} onChange={s('cnae')} disabled={off} ancho="md:col-span-2" ayuda="Desde mayo de 2026 el Registro solo acepta CNAE-2025." />
          <Campo id="m-domicilio" label="Domicilio social" valor={sociedad.domicilioSocial} onChange={s('domicilioSocial')} disabled={off} ancho="md:col-span-6" />
          <Campo id="m-cp" label="Código postal" valor={sociedad.codigoPostal} onChange={s('codigoPostal')} disabled={off} ancho="md:col-span-2" />
          <Campo id="m-municipio" label="Municipio" valor={sociedad.municipio} onChange={s('municipio')} disabled={off} ancho="md:col-span-2" />
          <Campo id="m-provincia" label="Provincia" valor={sociedad.provincia} onChange={s('provincia')} disabled={off} ancho="md:col-span-2" />
          <Campo
            id="m-actividad"
            label="Actividad principal"
            valor={sociedad.actividad}
            onChange={s('actividad')}
            area
            disabled={off}
            ancho="md:col-span-6"
            ayuda="Tal como quieres que aparezca en la nota 1, por ejemplo: «la fabricación y venta de muebles de madera»."
          />
          <Campo id="m-rm" label="Registro Mercantil de" valor={sociedad.registroMercantilProvincia} onChange={s('registroMercantilProvincia')} disabled={off} ancho="md:col-span-2" />
          <Campo
            id="m-registrales"
            label="Datos registrales"
            valor={sociedad.datosRegistrales}
            onChange={s('datosRegistrales')}
            disabled={off}
            ancho="md:col-span-4"
            ayuda="Tomo, folio, hoja e inscripción."
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Datos del ejercicio {ejercicio}</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Campo id="m-plantilla" label="Plantilla media" tipo="number" valor={notas.plantillaMedia} onChange={nn('plantillaMedia')} disabled={off} ayuda="Personas empleadas de media en el año." />
          <Campo id="m-hombres" label="Hombres" tipo="number" valor={notas.plantillaMediaHombres} onChange={nn('plantillaMediaHombres')} disabled={off} />
          <Campo id="m-mujeres" label="Mujeres" tipo="number" valor={notas.plantillaMediaMujeres} onChange={nn('plantillaMediaMujeres')} disabled={off} />
          <Campo id="m-pmp" label="Periodo medio de pago (días)" tipo="number" valor={notas.periodoMedioPago} onChange={nn('periodoMedioPago')} disabled={off} />
          <Campo
            id="m-administradores"
            label="Remuneración de los administradores"
            valor={notas.remuneracionAdministradores}
            onChange={nn('remuneracionAdministradores')}
            area
            disabled={off}
            ancho="md:col-span-2"
            ayuda="Aunque sea cero: «no han percibido remuneración»."
          />
          <Campo
            id="m-vinculadas"
            label="Operaciones con partes vinculadas"
            valor={notas.partesVinculadas}
            onChange={nn('partesVinculadas')}
            area
            disabled={off}
            ancho="md:col-span-2"
            ayuda="Con socios, administradores o empresas del grupo. Si no hay, indícalo."
          />
          <Campo
            id="m-posteriores"
            label="Hechos posteriores al cierre"
            valor={notas.hechosPosteriores}
            onChange={nn('hechosPosteriores')}
            area
            disabled={off}
            ancho="md:col-span-2"
            ayuda="Si no los hay: «no se han producido»."
          />
          <Campo id="m-otra" label="Otra información (opcional)" valor={notas.otraInformacion} onChange={nn('otraInformacion')} area disabled={off} ancho="md:col-span-2" />
        </div>
      </fieldset>

      {mensaje && (
        <p
          role={mensaje.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-4 py-3 text-sm ${mensaje.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {mensaje.texto}
        </p>
      )}

      {puedeEditar && (
        <div className="flex justify-end">
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar datos'}
          </button>
        </div>
      )}
    </form>
  );
}
