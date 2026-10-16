import { resolveBraceEndpointDiameters } from './braceDiameters';
import { registerSupportProxyGeometry } from '../../proxyGeometry/seam';
import { braceBezierToBatchedShaft } from '../../Curves/batchedBezierShaft';
import { knotHostId, spanKnotHostType } from '../../supportTypeRegistry';
import type { Brace } from '../../types';

/**
 * A brace spans two knots and is addressed as a segment of its own, under the
 * synthetic id its type declares.
 *
 * Relative braces retain their resolved uniform diameter; legacy braces keep
 * the host-knot sizing used by the detailed and scene batch renderers.
 */
registerSupportProxyGeometry<Brace>('brace', (brace, ctx) => {
  const startKnot = ctx.state.knots[brace.startKnotId];
  const endKnot = ctx.state.knots[brace.endKnotId];
  if (!startKnot || !endKnot) return;

  const { startDiameter: startHostDiameter, endDiameter: endHostDiameter } = resolveBraceEndpointDiameters(brace, startKnot, endKnot);

  const braceDiameter = (startHostDiameter + endHostDiameter) * 0.5;

  if (brace.curve?.type === 'bezier') {
    ctx.pushShaft(braceBezierToBatchedShaft(
      knotHostId(spanKnotHostType(), brace.id),
      startKnot.pos,
      endKnot.pos,
      brace.curve.controlPoint1,
      brace.curve.controlPoint2,
      braceDiameter,
      brace.curve.resolution,
      brace.id,
      brace.modelId,
    ));
    return;
  }

  ctx.pushShaft({
    id: knotHostId(spanKnotHostType(), brace.id),
    supportId: brace.id,
    modelId: brace.modelId,
    start: startKnot.pos,
    end: endKnot.pos,
    diameter: braceDiameter,
  });
}, { skipInInteriorView: true });
