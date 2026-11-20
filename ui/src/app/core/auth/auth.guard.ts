import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Laisse passer si un utilisateur est connecté.
 * Sinon : redirection vers /login?retour=<page demandée>.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.utilisateur()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { retour: state.url } });
};