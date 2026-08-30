import Anthropic from '@anthropic-ai/sdk';
import { COACH_MODEL } from '../config.js';
import type { Color, PerfilJugador } from '../types.js';
import { CoachNoConfigurado, clienteAnthropic, coachDisponible } from './explicar.js';

const NOMBRE_COLOR: Record<Color, string> = { w: 'blancas', b: 'negras' };

const SISTEMA = `Eres un entrenador de ajedrez que escribe el informe de un alumno aficionado, en espanol de Espana, tuteandole y sin paja.

Recibes un perfil calculado a partir de sus partidas analizadas con Stockfish. Cada dato lleva el tamano de la muestra en la que se basa.

Reglas:
- No contradigas los datos ni te inventes cifras. Si algo se apoya en pocas partidas, dilo o no lo afirmes.
- Empieza por lo que hace bien, en una frase honesta, no en un halago vacio.
- El grueso del informe es que entrenar y por que, en orden de impacto.
- Sobre aperturas puedes recomendar sistemas concretos que NO aparezcan en sus datos, apoyandote en tu conocimiento de ajedrez. Cuando lo hagas, di claramente que es una recomendacion tuya y no algo sacado de sus partidas, y explica por que le encaja segun lo que se ve en su perfil.
- Termina con que hacer esta semana, concreto y realista.
- Entre 4 y 6 parrafos cortos. Prosa seguida, sin listas ni titulos.`;

/** Traduce el perfil a un texto de hechos, sin opiniones ya masticadas. */
function describirPerfil(p: PerfilJugador): string {
  const lineas: string[] = [
    `Partidas analizadas: ${p.partidas}. Precision media: ${p.precisionMedia}%.`,
    `Jugadas que coinciden con la primera opcion del motor: ${p.aciertoMejor}%.`,
    `Partidas sin ningun error grave: ${p.solidez.sinGraves} de ${p.solidez.partidas}.`,
  ];

  if (p.castigo) {
    lineas.push(
      `Fallos del rival aprovechados: ${p.castigo.aprovechadas} de ${p.castigo.ocasiones} ocasiones.`,
    );
  }
  if (p.tendencia) {
    lineas.push(
      `Evolucion: primera mitad ${p.tendencia.antes}% de precision, segunda mitad ${p.tendencia.ahora}%.`,
    );
  }

  for (const color of ['w', 'b'] as Color[]) {
    const c = p.porColor[color];
    if (c.partidas === 0) {
      lineas.push(`\nCon ${NOMBRE_COLOR[color]}: ninguna partida analizada.`);
      continue;
    }

    lineas.push(
      `\nCon ${NOMBRE_COLOR[color]} (${c.partidas} partidas): precision ${c.precisionMedia}%, ${c.rendimiento} puntos por partida.`,
      `  Perdida por fase: apertura ${c.perdidaPorFase.apertura.perdidaMedia} cp en ${c.perdidaPorFase.apertura.jugadas} jugadas, medio juego ${c.perdidaPorFase.medio.perdidaMedia} cp en ${c.perdidaPorFase.medio.jugadas}, final ${c.perdidaPorFase.final.perdidaMedia} cp en ${c.perdidaPorFase.final.jugadas}.`,
      `  Aperturas distintas por partida: ${c.dispersionRepertorio} (1 significa una apertura nueva cada partida).`,
    );

    if (c.aperturas.length > 0) {
      lineas.push('  Aperturas que juega:');
      for (const a of c.aperturas.slice(0, 6)) {
        lineas.push(
          `    ${a.eco} ${a.nombre}: ${a.partidas} partidas, precision ${a.precisionMedia}% (${a.desviacion >= 0 ? '+' : ''}${a.desviacion} sobre su media con ese color), ${a.victorias}V/${a.tablas}E/${a.derrotas}D.`,
        );
      }
    }
  }

  if (p.fuertes.length > 0) {
    lineas.push('\nPuntos fuertes detectados:');
    for (const f of p.fuertes) {
      lineas.push(`  ${f.titulo} — ${f.evidencia} (confianza ${f.confianza}).`);
    }
  }
  if (p.debiles.length > 0) {
    lineas.push('\nPatrones que repite:');
    for (const d of p.debiles) {
      lineas.push(`  ${d.titulo} — ${d.evidencia} (confianza ${d.confianza}).`);
    }
  }

  return lineas.join('\n');
}

/**
 * Informe del entrenador sobre el perfil completo.
 *
 * A diferencia del resto de la aplicacion, aqui el modelo si puede recomendar
 * aperturas que el jugador no ha jugado nunca: eso no esta en sus datos y es
 * justo lo que un entrenador aporta. Se le exige decir cuando una recomendacion
 * sale de su criterio y no de las partidas.
 */
export async function redactarInforme(perfil: PerfilJugador): Promise<string> {
  if (!coachDisponible()) {
    throw new CoachNoConfigurado('No hay ANTHROPIC_API_KEY configurada.');
  }

  const respuesta = await clienteAnthropic().beta.messages.create({
    model: COACH_MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: describirPerfil(perfil) }],
  });

  const texto = respuesta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!texto) throw new Error('El modelo no devolvio ningun informe.');
  return texto;
}
