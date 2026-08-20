import { PageHeader } from "@/components/page-header";
import { SettingsSection, SettingsSurface } from "@/components/forms/settings-section";

/**
 * "Qué atestigua el registro" — the page the Operador Nuvora hands to the
 * Admin Cliente so compliance knows what the evidence proves before signing
 * for it. Static, read-only, in the domain's own language (CONTEXT.md): avance
 * atestigua exposición, la Evaluación atestigua aprendizaje, los Intentos son
 * append-only y vale el último, Completado = avance 100% + Evaluación
 * aprobada. No data is fetched — nothing here can drift out of sync with a
 * specific Ola.
 */
export function RegistroView() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Qué atestigua el registro"
        subtitle="Lo que la evidencia del Curso prueba — y dónde termina lo que prueba — antes de firmar por ella."
      />
      <SettingsSurface>
        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-ink">Avance — atestigua exposición</h2>
          </header>
          <div className="flex flex-col gap-3 text-sm text-ink-2 text-pretty">
            <p>
              El avance atestigua <strong className="font-semibold text-ink">exposición</strong>:
              que el Trabajador estuvo frente al contenido del Curso. Es la parte del registro que
              la plataforma mide por reproducción.
            </p>
            <p>
              El avance solo sube con reproducción continua. El reproductor no permite saltar hacia
              adelante — un salto cae de vuelta al último segundo efectivamente visto — y reproduce
              a lo más 2× de velocidad. Un Segmento queda completado solo al llevarlo hasta el
              final.
            </p>
            <p>
              Lo que el avance no atestigua es aprendizaje. Para eso está la Evaluación.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-ink">Evaluación — atestigua aprendizaje</h2>
          </header>
          <div className="flex flex-col gap-3 text-sm text-ink-2 text-pretty">
            <p>
              La Evaluación es un instrumento propio del Curso — no una actividad más del programa —
              y atestigua{" "}
              <strong className="font-semibold text-ink">aprendizaje</strong>.
            </p>
            <p>
              La corrección y el corte corren en la plataforma, no en el navegador del Trabajador:
              nadie rinde reportando su propio puntaje. El corte es el vigente al momento de rendir
              (70% por defecto) y queda registrado en cada Intento.
            </p>
            <p>
              La Evaluación se desbloquea con avance 100%: no se rinde sin haber recorrido el
              Curso. Un Curso puede entregarse sin Evaluación; en ese caso completa por avance.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-ink">
              Intentos — inmutables; vale el último
            </h2>
          </header>
          <div className="flex flex-col gap-3 text-sm text-ink-2 text-pretty">
            <p>
              Cada rendición registrada de la Evaluación es un Intento: inmutable y de
              solo-agregación. Guarda inicio, envío, respuestas, puntaje, el corte vigente al
              rendir y su número. Los Intentos no se editan ni se eliminan.
            </p>
            <p>
              Vale el último resultado; la evidencia de auditoría es la secuencia completa, no solo
              el resultado final. Los intentos son ilimitados y no existe un estado de reprobado:
              un Intento bajo el corte habilita a rendir de nuevo.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-ink">
              Completado — avance 100% y Evaluación aprobada
            </h2>
          </header>
          <div className="flex flex-col gap-3 text-sm text-ink-2 text-pretty">
            <p>
              Completado es el estado de un Trabajador en un Curso: avance 100% y Evaluación
              aprobada. Sin las dos cosas, el Curso no está Completado.
            </p>
            <p>
              Cada Ola avanza por sí misma al criterio de &gt;80% de Trabajadores Completados, sin
              intervención manual.
            </p>
          </div>
        </section>

        <SettingsSection
          title="Cómo leer el reporte por Ola"
          description="Cada columna del reporte, en los términos de arriba."
        >
          <dl className="flex flex-col divide-y divide-line">
            {[
              [
                "Avance",
                "Exposición: porcentaje de Segmentos del Curso completados por reproducción.",
              ],
              ["Evaluación — Aprobada", "El último Intento superó el corte vigente."],
              [
                "Evaluación — Bloqueada",
                "El avance aún no llega a 100%; rendir está bloqueado.",
              ],
              ["Evaluación — Pendiente", "Avance 100% y aún sin Intentos rendidos."],
              [
                "Evaluación — Último intento",
                "Rindió, y el último Intento quedó bajo el corte; puede volver a rendir.",
              ],
              ["Evaluación — Sin evaluación", "El Curso no lleva Evaluación."],
              ["Puntaje", "El del último Intento, sobre 100."],
              ["Intentos", "Número de Intentos rendidos."],
              [
                "Completado",
                "Avance 100% y Evaluación aprobada — o avance 100% cuando el Curso no lleva Evaluación.",
              ],
            ].map(([term, meaning]) => (
              <div key={term} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-8">
                <dt className="min-w-0 text-sm font-medium text-ink sm:w-56 sm:shrink-0">
                  {term}
                </dt>
                <dd className="min-w-0 text-sm text-ink-3 text-pretty">{meaning}</dd>
              </div>
            ))}
          </dl>
        </SettingsSection>
      </SettingsSurface>
    </div>
  );
}
