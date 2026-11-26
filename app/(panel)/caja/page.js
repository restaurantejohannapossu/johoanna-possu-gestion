'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, ArrowUpCircle, ArrowDownCircle, Scale, Lock, Printer, PencilLine } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Modal, TablaDatos, Kpi, Cargando, Alerta, Estado, useAviso, useCarga } from '@/components/ui';
import Denominaciones, { totalDenominaciones } from '@/components/Denominaciones';
import { q, rpc, supabase } from '@/lib/supabase';
import { moneda, fechaHora, hoyISO, etiqueta } from '@/lib/formato';

export default function Pagina() {
  return <Requiere permisos={['caja.operar', 'caja.ver_todas']}><Caja /></Requiere>;
}

function Caja() {
  const { sedeId, puede } = useSesion();
  const [tab, setTab] = useState('mia');
  return (
    <div>
      <Encabezado titulo="Caja" subtitulo="Apertura, movimientos y cierre de caja por sede y usuario" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[
        puede('caja.operar') && { id: 'mia', etiqueta: 'Mi caja' },
        puede('caja.ver_todas') && { id: 'abiertas', etiqueta: 'Cajas abiertas' },
        { id: 'historial', etiqueta: 'Historial de cierres' },
      ]} />
      {tab === 'mia' && puede('caja.operar') && <MiCaja sedeId={sedeId} />}
      {tab === 'abiertas' && <CajasAbiertas sedeId={sedeId} />}
      {tab === 'historial' && <Historial sedeId={sedeId} />}
    </div>
  );
}

function MiCaja({ sedeId }) {
  const aviso = useAviso();
  const [uid, setUid] = useState(null);
  useEffect(() => { supabase().auth.getUser().then(({ data }) => setUid(data.user?.id)); }, []);
  const { datos: sesion, cargando, recargar } = useCarga(async () => {
    if (!uid || !sedeId) return null;
    return q((sb) => sb.from('caja_sesiones').select('*, cajas(nombre)').eq('usuario_id', uid).eq('estado', 'abierta').maybeSingle());
  }, [uid, sedeId]);
  if (cargando || !uid) return <Cargando />;
  if (!sesion) return <AbrirCaja sedeId={sedeId} onAbierta={recargar} />;
  if (sesion.sede_id !== sedeId) return <Alerta>Tienes una caja abierta en otra sede. Cambia de sede en la parte superior para verla o cerrarla.</Alerta>;
  return <SesionAbierta sesion={sesion} onCerrada={() => { aviso.ok('Caja cerrada correctamente.'); recargar(); }} />;
}

function AbrirCaja({ sedeId, onAbierta }) {
  const aviso = useAviso();
  const [cajas, setCajas] = useState([]);
  const [cajaId, setCajaId] = useState('');
  const [saldo, setSaldo] = useState('');
  const [denom, setDenom] = useState({});
  const [usarDenom, setUsarDenom] = useState(false);
  const [obs, setObs] = useState('');
  useEffect(() => {
    if (!sedeId) return;
    Promise.all([
      q((sb) => sb.from('cajas').select('id,nombre').eq('sede_id', sedeId).eq('activa', true).order('nombre')),
      q((sb) => sb.from('caja_sesiones').select('caja_id').eq('sede_id', sedeId).eq('estado', 'abierta')),
    ]).then(([c, abiertas]) => {
      const ocupadas = new Set(abiertas.map((a) => a.caja_id));
      const libres = c.map((x) => ({ ...x, ocupada: ocupadas.has(x.id) }));
      setCajas(libres); setCajaId(libres.find((x) => !x.ocupada)?.id || '');
    }).catch(aviso.error);
  }, [sedeId, aviso.error]);
  const valor = usarDenom ? totalDenominaciones(denom) : Number(saldo || 0);
  async function abrir() {
    try {
      await rpc('abrir_caja', { p_caja: cajaId, p_saldo: valor, p_denominaciones: usarDenom ? denom : null, p_obs: obs || null });
      aviso.ok('Caja abierta. ¡Buen turno!'); onAbierta();
    } catch (e) { aviso.error(e); }
  }
  return (
    <div className="tarjeta mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center gap-3"><Wallet className="text-vino-700" /><h2 className="text-xl font-bold">Abrir caja</h2></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Caja">
          <select className="input" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
            <option value="">Selecciona…</option>
            {cajas.map((c) => <option key={c.id} value={c.id} disabled={c.ocupada}>{c.nombre}{c.ocupada ? ' (abierta por otro usuario)' : ''}</option>)}
          </select>
        </Campo>
        {!usarDenom && <Campo etiqueta="Saldo inicial (base)"><input type="number" className="input text-lg" value={saldo} onChange={(e) => setSaldo(e.target.value)} /></Campo>}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={usarDenom} onChange={(e) => setUsarDenom(e.target.checked)} /> Contar por billetes y monedas</label>
      {usarDenom && <div className="mt-3"><Denominaciones valor={denom} onCambio={setDenom} /></div>}
      <Campo etiqueta="Observaciones" className="mt-3"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm">Base: <b className="font-titulo text-xl">{moneda(valor)}</b></p>
        <button className="btn-primario px-6" disabled={!cajaId} onClick={abrir}>Abrir caja</button>
      </div>
      {cajas.length === 0 && <p className="mt-3 text-sm text-red-700">Esta sede no tiene cajas creadas. Créalas en el módulo Sedes.</p>}
    </div>
  );
}

function ResumenCaja({ r }) {
  if (!r) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi titulo="Saldo inicial" valor={moneda(r.saldo_inicial)} />
      <Kpi titulo="Total ventas" valor={moneda(r.total_ventas)} detalle={`Efectivo ${moneda(r.ventas_efectivo)} · Otros ${moneda(r.ventas_otros_medios)}`} />
      <Kpi titulo="Ingresos adicionales" valor={moneda(r.ingresos)} tono="verde" />
      <Kpi titulo="Gastos y pagos" valor={moneda(r.gastos)} tono="rojo" />
      <Kpi titulo="Retiros" valor={moneda(r.retiros)} tono="rojo" />
      <Kpi titulo="Devoluciones" valor={moneda(r.devoluciones)} tono="rojo" />
      <Kpi titulo="Ajustes" valor={moneda(r.ajustes)} tono="cafe" />
      <Kpi titulo="Efectivo esperado" valor={moneda(r.saldo_esperado)} tono="dorado" detalle="Lo que debe haber en el cajón" />
    </div>
  );
}

function SesionAbierta({ sesion, onCerrada }) {
  const { puede } = useSesion();
  const aviso = useAviso();
  const [mov, setMov] = useState(null);
  const [cierre, setCierre] = useState(null);
  const { datos, recargar } = useCarga(async () => {
    const [r, m] = await Promise.all([
      rpc('resumen_caja', { p_sesion: sesion.id }),
      q((sb) => sb.from('caja_movimientos').select('*, metodos_pago(nombre), perfiles(nombre)').eq('sesion_id', sesion.id).order('creado_en', { ascending: false })),
    ]);
    return { r, m };
  }, [sesion.id]);

  async function registrarMov() {
    try {
      await rpc('movimiento_caja', { p_sesion: sesion.id, p_tipo: mov.tipo, p_valor: Number(mov.valor), p_descripcion: mov.descripcion });
      setMov(null); recargar(); aviso.ok('Movimiento registrado.');
    } catch (e) { aviso.error(e); }
  }
  async function cerrar() {
    const contado = cierre.usarDenom ? totalDenominaciones(cierre.denom) : Number(cierre.contado || 0);
    try {
      await rpc('cerrar_caja', { p_sesion: sesion.id, p_contado: contado, p_denominaciones: cierre.usarDenom ? cierre.denom : null, p_obs: cierre.obs || null });
      window.open(`/imprimir/caja/${sesion.id}`, '_blank');
      setCierre(null); onCerrada();
    } catch (e) { aviso.error(e); }
  }
  const contadoCierre = cierre ? (cierre.usarDenom ? totalDenominaciones(cierre.denom) : Number(cierre.contado || 0)) : 0;

  return (
    <div>
      <div className="tarjeta mb-4 flex flex-wrap items-center gap-3 p-4">
        <Wallet className="text-emerald-600" />
        <div className="flex-1"><p className="font-bold">{sesion.cajas?.nombre} · abierta</p><p className="text-xs text-cafe-400">Desde {fechaHora(sesion.abierta_en)}</p></div>
        {puede('caja.movimientos') && <>
          <button className="btn-secundario" onClick={() => setMov({ tipo: 'ingreso', valor: '', descripcion: '' })}><ArrowUpCircle size={16} /> Ingreso</button>
          <button className="btn-secundario" onClick={() => setMov({ tipo: 'retiro', valor: '', descripcion: '' })}><ArrowDownCircle size={16} /> Retiro</button>
        </>}
        {puede('caja.ajustes') && <button className="btn-secundario" onClick={() => setMov({ tipo: 'ajuste', valor: '', descripcion: '' })}><Scale size={16} /> Ajuste</button>}
        <Link href="/salidas" className="btn-secundario"><ArrowDownCircle size={16} /> Gasto</Link>
        <button className="btn-primario" onClick={() => setCierre({ contado: '', denom: {}, usarDenom: true, obs: '' })}><Lock size={16} /> Cerrar caja</button>
      </div>
      {!datos ? <Cargando /> : (
        <>
          <ResumenCaja r={datos.r} />
          {datos.r.por_metodo?.length > 0 && (
            <div className="tarjeta mt-4 flex flex-wrap gap-4 p-4 text-sm">
              {datos.r.por_metodo.map((m) => <span key={m.metodo}><b>{m.metodo}:</b> {moneda(m.total)}</span>)}
            </div>
          )}
          <h3 className="mb-2 mt-6 font-bold">Movimientos del turno</h3>
          <TablaDatos filas={datos.m} exportar="Movimientos de caja" columnas={[
            { clave: 'creado_en', titulo: 'Hora', tipo: 'fechahora' },
            { clave: 'tipo', titulo: 'Tipo', tipo: 'etiqueta' },
            { clave: 'descripcion', titulo: 'Descripción' },
            { clave: 'metodo', titulo: 'Medio', render: (f) => f.metodos_pago?.nombre || 'Efectivo', exportar: (f) => f.metodos_pago?.nombre || 'Efectivo' },
            { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
            { clave: 'valor', titulo: 'Valor', tipo: 'moneda', render: (f) => <span className={Number(f.valor) < 0 ? 'text-red-700' : 'text-emerald-700'}>{moneda(f.valor)}</span> },
          ]} />
        </>
      )}

      <Modal abierto={!!mov} onCerrar={() => setMov(null)} titulo={mov ? `Registrar ${etiqueta(mov.tipo).toLowerCase()}` : ''}
        pie={<><button className="btn-secundario" onClick={() => setMov(null)}>Cancelar</button><button className="btn-primario" disabled={!Number(mov?.valor) || !mov?.descripcion?.trim()} onClick={registrarMov}>Registrar</button></>}>
        {mov && <div className="space-y-3">
          <Campo etiqueta="Valor" ayuda={mov.tipo === 'ajuste' ? 'Use un valor negativo para restar dinero de la caja.' : null}>
            <input type="number" className="input text-lg" value={mov.valor} onChange={(e) => setMov({ ...mov, valor: e.target.value })} autoFocus /></Campo>
          <Campo etiqueta="Descripción / motivo"><input className="input" value={mov.descripcion} onChange={(e) => setMov({ ...mov, descripcion: e.target.value })} /></Campo>
        </div>}
      </Modal>

      <Modal abierto={!!cierre} onCerrar={() => setCierre(null)} titulo="Cierre de caja" ancho="max-w-2xl"
        pie={<><button className="btn-secundario" onClick={() => setCierre(null)}>Cancelar</button><button className="btn-primario" onClick={cerrar}>Confirmar cierre</button></>}>
        {cierre && datos && <>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={cierre.usarDenom} onChange={(e) => setCierre({ ...cierre, usarDenom: e.target.checked })} /> Contar por billetes y monedas</label>
          {cierre.usarDenom ? <Denominaciones valor={cierre.denom} onCambio={(denom) => setCierre({ ...cierre, denom })} />
            : <Campo etiqueta="Efectivo contado"><input type="number" className="input text-lg" value={cierre.contado} onChange={(e) => setCierre({ ...cierre, contado: e.target.value })} /></Campo>}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-crema-100 p-3 text-center">
            <div><p className="text-xs text-cafe-400">Esperado</p><p className="font-titulo text-lg font-bold">{moneda(datos.r.saldo_esperado)}</p></div>
            <div><p className="text-xs text-cafe-400">Contado</p><p className="font-titulo text-lg font-bold">{moneda(contadoCierre)}</p></div>
            <div><p className="text-xs text-cafe-400">Diferencia</p>
              <p className={`font-titulo text-lg font-bold ${contadoCierre - datos.r.saldo_esperado === 0 ? 'text-emerald-700' : 'text-red-700'}`}>{moneda(contadoCierre - datos.r.saldo_esperado)}</p></div>
          </div>
          <Campo etiqueta="Observaciones del cierre" className="mt-3"><textarea className="input" rows={2} value={cierre.obs} onChange={(e) => setCierre({ ...cierre, obs: e.target.value })} /></Campo>
        </>}
      </Modal>
    </div>
  );
}

function CajasAbiertas({ sedeId }) {
  const { datos, cargando } = useCarga(async () => {
    const s = await q((sb) => sb.from('caja_sesiones').select('*, cajas(nombre), perfiles!caja_sesiones_usuario_id_fkey(nombre)').eq('sede_id', sedeId).eq('estado', 'abierta'));
    return Promise.all(s.map(async (x) => ({ ...x, r: await rpc('resumen_caja', { p_sesion: x.id }) })));
  }, [sedeId]);
  if (cargando) return <Cargando />;
  if (!datos?.length) return <p className="tarjeta p-6 text-center text-sm text-cafe-400">No hay cajas abiertas en esta sede.</p>;
  return (
    <div className="space-y-4">
      {datos.map((s) => (
        <div key={s.id} className="tarjeta p-4">
          <p className="mb-3 font-bold">{s.cajas?.nombre} · {s.perfiles?.nombre} <span className="text-xs font-normal text-cafe-400">desde {fechaHora(s.abierta_en)}</span></p>
          <ResumenCaja r={s.r} />
        </div>
      ))}
    </div>
  );
}

function Historial({ sedeId }) {
  const { puede } = useSesion();
  const aviso = useAviso();
  const [desde, setDesde] = useState(hoyISO(-30));
  const [hasta, setHasta] = useState(hoyISO());
  const [corregir, setCorregir] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('caja_sesiones')
    .select('*, cajas(nombre), perfiles!caja_sesiones_usuario_id_fkey(nombre)').eq('sede_id', sedeId)
    .gte('abierta_en', `${desde}T00:00:00-05:00`).lte('abierta_en', `${hasta}T23:59:59-05:00`).order('abierta_en', { ascending: false })), [sedeId, desde, hasta]);
  async function guardarCorreccion() {
    try { await rpc('corregir_cierre_caja', { p_sesion: corregir.id, p_contado: Number(corregir.contado), p_motivo: corregir.motivo }); setCorregir(null); recargar(); aviso.ok('Cierre corregido y registrado en auditoría.'); }
    catch (e) { aviso.error(e); }
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Historial de caja" columnas={[
        { clave: 'abierta_en', titulo: 'Apertura', tipo: 'fechahora' },
        { clave: 'cerrada_en', titulo: 'Cierre', tipo: 'fechahora' },
        { clave: 'caja', titulo: 'Caja', render: (f) => f.cajas?.nombre, exportar: (f) => f.cajas?.nombre },
        { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
        { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
        { clave: 'saldo_inicial', titulo: 'Inicial', tipo: 'moneda' },
        { clave: 'saldo_esperado', titulo: 'Esperado', tipo: 'moneda' },
        { clave: 'saldo_contado', titulo: 'Contado', tipo: 'moneda' },
        { clave: 'diferencia', titulo: 'Diferencia', tipo: 'moneda', render: (f) => f.diferencia === null ? '—' : <span className={Number(f.diferencia) === 0 ? 'text-emerald-700' : 'font-bold text-red-700'}>{moneda(f.diferencia)}</span> },
      ]} acciones={(f) => f.estado === 'cerrada' && (
        <div className="flex justify-end gap-1">
          <Link href={`/imprimir/caja/${f.id}`} target="_blank" className="btn-secundario btn-sm"><Printer size={13} /></Link>
          {puede('caja.ajustes') && <button className="btn-secundario btn-sm" onClick={() => setCorregir({ id: f.id, contado: f.saldo_contado, motivo: '' })}><PencilLine size={13} /></button>}
        </div>
      )} />
      <Modal abierto={!!corregir} onCerrar={() => setCorregir(null)} titulo="Corregir cierre de caja"
        pie={<><button className="btn-secundario" onClick={() => setCorregir(null)}>Cancelar</button><button className="btn-primario" disabled={!corregir?.motivo?.trim()} onClick={guardarCorreccion}>Guardar corrección</button></>}>
        {corregir && <div className="space-y-3">
          <Alerta>La corrección queda registrada en auditoría con el valor anterior y el nuevo.</Alerta>
          <Campo etiqueta="Efectivo contado correcto"><input type="number" className="input" value={corregir.contado} onChange={(e) => setCorregir({ ...corregir, contado: e.target.value })} /></Campo>
          <Campo etiqueta="Motivo (obligatorio)"><textarea className="input" value={corregir.motivo} onChange={(e) => setCorregir({ ...corregir, motivo: e.target.value })} /></Campo>
        </div>}
      </Modal>
    </>
  );
}
