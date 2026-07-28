import { HomeAgenda } from './HomeAgenda'

/**
 * Home — an agenda-style landing: a "Coming up" card (what's due next), a day-grouped feed of
 * recent activity, and a docked Ask bar. The conversational assistant is no longer part of this
 * page: it is a global overlay (mounted in Workbench, summonable anywhere), so opening it does not
 * navigate here and closing it does not strand you here.
 */
export function Portfolio() {
  return (
    <div className="pf pf-home">
      <HomeAgenda />
    </div>
  )
}
