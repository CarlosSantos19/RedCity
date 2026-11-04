import { COMISION, cop, desglose } from '../servicios';

/** Muestra cuánto paga el cliente, cuánto es la comisión y cuánto recibe el proveedor. */
export function Desglose({ valor, quien }: { valor: number; quien: 'cliente' | 'proveedor' }) {
  const d = desglose(valor);
  return (
    <div className="desglose">
      <div><span>Valor del servicio</span><b>{cop(d.valor)}</b></div>
      {quien === 'cliente' && (
        <>
          <div className="muted"><span>Costo de la transacción (PSE/Nequi/tarjeta)*</span><span>+ {cop(d.pasarela)}</span></div>
          <div className="total"><span>Tú pagas</span><b>{cop(d.total)}</b></div>
        </>
      )}
      <div className="muted"><span>Comisión RedCity ({COMISION * 100}%)</span><span>− {cop(d.comision)}</span></div>
      <div><span>{quien === 'proveedor' ? 'Tú recibes' : 'El proveedor recibe'}</span><b>{cop(d.neto)}</b></div>
      {quien === 'cliente' && <small className="muted">* Valor estimado; el definitivo depende del medio de pago.</small>}
    </div>
  );
}
