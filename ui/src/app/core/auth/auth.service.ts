import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from '../api/banque';

export interface Utilisateur {
  readonly login: string;
  readonly roles: readonly string[];
}

/**
 * Garde l'utilisateur connecté et ses identifiants (en mémoire seulement).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly utilisateur = signal<Utilisateur | null>(null);

  /** L'en-tête « Basic … » à envoyer, ou null si personne n'est connecté. */
  private enTete: string | null = null;

  /** Utilisé par l'intercepteur (étape 2.2). */
  enTeteAuthorization(): string | null {
    return this.enTete;
  }

  /**
   * Vérifie les identifiants auprès du serveur (GET /api/me avec l'en-tête
   * Basic) et mémorise l'utilisateur. Échoue (throw) si le serveur répond 401.
   */
  async connecter(login: string, motDePasse: string): Promise<void> {
    const enTete = 'Basic ' + btoa(`${login}:${motDePasse}`);
    const utilisateur = await firstValueFrom(
      this.http.get<Utilisateur>(`${API}/me`, { headers: { Authorization: enTete } }),
    );
    this.enTete = enTete;
    this.utilisateur.set(utilisateur);
  }

  deconnecter(): void {
    this.enTete = null;
    this.utilisateur.set(null);
  }
}