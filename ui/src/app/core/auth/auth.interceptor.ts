import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API } from '../api/banque';
import { AuthService } from './auth.service';

/**
 * Ajoute l'en-tête Basic aux requêtes vers l'API.
 * Sur un 401 : déconnecte et renvoie vers /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // On ne touche qu'aux requêtes vers NOTRE API
  if (!req.url.startsWith(API)) {
    return next(req);
  }

  // La connexion (AuthService.connecter) met déjà son propre en-tête : on le laisse
  const dejaUnEnTete = req.headers.has('Authorization');
  const enTete = auth.enTeteAuthorization();

  const requete =
    enTete && !dejaUnEnTete ? req.clone({ setHeaders: { Authorization: enTete } }) : req;

  return next(requete).pipe(
    catchError((erreur: unknown) => {
      // 401 sur une requête normale : identifiants plus valables → retour au login
      if (erreur instanceof HttpErrorResponse && erreur.status === 401 && !dejaUnEnTete) {
        auth.deconnecter();
        void router.navigateByUrl('/login');
      }
      return throwError(() => erreur);
    }),
  );
};