# Banque : sécuriser une appli de virement

Une micro-appli de virement : API **Spring Boot 4** (Java 25) et front **Angular**.
**Elle fonctionne, mais n'est pas sécurisée : n'importe qui peut tout faire.** Votre travail est de la protéger.

## Le métier en 30 secondes

- Un **client** a un **compte** et peut faire des **virements** (statut `EN_ATTENTE`).
- Un **conseiller** **valide** un virement (statut `VALIDE`) : l'argent part, et on garde qui l'a validé.

## Lancer

```
./gradlew bootRun                    # API sur http://localhost:8080
cd ui && npm install && npm start    # front sur http://localhost:4200
```

Base H2 en mémoire, console sur http://localhost:8080/h2-console (`jdbc:h2:mem:banque`).

## Les comptes de démo (définis dans `application.yml`)

| Login | Mot de passe | Rôle | Compte | Agence |
|---|---|---|---|---|
| `alice` | `alice123` | `CLIENT` | `FR76-0001` | Lyon Part-Dieu |
| `charles` | `charles123` | `CLIENT` | `FR76-0002` | Lyon Part-Dieu |
| `diane` | `diane123` | `CLIENT` | `FR76-0003` | Paris Opéra |
| `bruno` | `bruno123` | `CONSEILLER` | ceux de son agence | Lyon Part-Dieu |

Les mots de passe sont hachés en BCrypt avant d'aller en base. Ne touchez pas à `DonneesDemo`.

## API

| Méthode | URL | Rôle |
|---|---|---|
| GET | `/api/me` | l'utilisateur courant : `{login, roles}` (401 si personne) |
| GET | `/api/comptes` | les comptes |
| GET | `/api/comptes/{id}` | un compte (404 si absent) |
| GET | `/api/virements?compte={id}&page=0` | les virements d'un compte |
| POST | `/api/virements` | créer `{compteId, ibanDestinataire, montant}` (montant en centimes) |
| POST | `/api/virements/{id}/valider` | valider un virement (409 s'il l'est déjà) |

## Où est le code ?

```
utilisateur/   Utilisateur (login, hash, rôle), Client, Conseiller
  in/            MeController
  out/           UtilisateurCourant (qui fait la requête ?) et son faux
compte/        Compte, Agence, CompteService
virement/      Virement, VirementService
config/        CORS, données de démo
ui/            le front Angular
```

Le faux `UtilisateurCourantFake` répond « alice » à tout le monde. C'est lui que vous remplacerez.

## Avant de commencer : constatez

Sans rien configurer, lancez :

```
curl localhost:8080/api/comptes
curl -XPOST localhost:8080/api/virements/2/valider
```

Tout le monde voit tous les comptes, et **alice**, une simple cliente, vient de valider son propre virement.

## Partie 1 : Basic Auth sur Spring

1. Ajoutez `org.springframework.boot:spring-boot-starter-security`. Relancez : que renvoie maintenant l'API ?
2. Déclarez le bean `PasswordEncoder` (BCrypt) : c'est lui qui comparera le mot de passe reçu au hash en base.
3. Écrivez un `UserDetailsService` qui charge l'`Utilisateur` en base par son login.
4. Écrivez la `SecurityFilterChain` : Basic Auth, sans session (`STATELESS`), toutes les requêtes `/api/**` authentifiées.
5. Vérifiez avec `curl -u alice:alice123 localhost:8080/api/me`, puis décodez l'en-tête `Authorization: Basic …` (`echo … | base64 -d`). Est-ce du chiffrement ?
6. Remplacez `UtilisateurCourantFake` par un `UtilisateurCourant` qui lit le `SecurityContext`.
7. Le front reçoit une erreur CORS : le navigateur envoie un `OPTIONS` **sans** identifiants. Autorisez-le dans la chaîne (`.cors(...)`).

*Piège :* le CSRF est actif par défaut. Pour une API stateless en Basic Auth, que faut-il en faire, et pourquoi ?

## Partie 2 : Angular

1. Dans `AuthService`, implémentez `connecter` : appelez `GET /api/me` avec l'en-tête `Authorization: Basic …` (`btoa('login:motDePasse')`). Gardez les identifiants **en mémoire** et renseignez `utilisateur`.
2. Écrivez un **intercepteur** fonctionnel (`HttpInterceptorFn`) qui ajoute l'en-tête aux requêtes vers l'API. Sur un `401`, il déconnecte et renvoie vers `/login`.
3. Écrivez une **guard** (`CanActivateFn`) : sans utilisateur connecté, redirection vers `/login?retour=<url demandée>`. Appliquez-la aux routes `comptes`.
4. La page `/login` est fournie. Testez-la avec un mauvais mot de passe, puis rechargez la page connecté : que se passe-t-il, et pourquoi ?

## Partie 3 : les rôles

Règles à faire respecter **côté serveur** :

| Action | Qui |
|---|---|
| Valider un virement | un `CONSEILLER` seulement |
| Voir un compte et ses virements | son titulaire, ou un conseiller **de la même agence** |
| Créer un virement | le titulaire du compte débité |

1. Protégez la validation (`hasRole('CONSEILLER')` dans la chaîne, ou `@PreAuthorize` avec `@EnableMethodSecurity`). Alice doit obtenir un `403`.
2. Alice demande le compte de Charles (`/api/comptes/2`) : fermez cette faille. Il faut regarder **l'utilisateur courant** dans le service, pas seulement le rôle.
3. `GET /api/comptes` ne doit renvoyer que les comptes auxquels on a droit.
4. Côté Angular : une guard par rôle (`data: { roles: [...] }` sur la route), et le bouton « Valider » visible seulement pour un conseiller.
5. Dans le navigateur, retirez le bouton « à la main » et appelez l'API : qu'est-ce qui vous protège ? **Le front n'est qu'un confort d'affichage.**

## Bonus

- Un test `MockMvc` avec `@WithMockUser` pour chaque règle de la partie 3.
- Répondre `404` plutôt que `403` sur le compte d'un autre : pourquoi ?
- Pourquoi BCrypt plutôt que SHA-256 ? Quel est son coût à chaque requête en Basic Auth ?
- Que faudrait-il changer pour passer en JWT ou en session ?

---

# Réponses et constats

## Avant de commencer : constat

- `curl localhost:8080/api/comptes` renvoie les 3 comptes (Alice, Charles, Diane)
  **sans aucune identification** : il n'y a pas d'authentification.
- `curl -XPOST localhost:8080/api/virements/2/valider` passe le virement n°2 en `VALIDE`
  avec `"validePar":"alice"` : une **cliente** valide un virement de son propre compte.
  Il n'y a pas d'autorisation (contrôle des rôles).
- Explication : `UtilisateurCourantFake` répond « alice » pour toutes les requêtes.

## Partie 1

### Étape 1 : ajout de `spring-boot-starter-security`

**Que renvoie maintenant l'API ?**

- Sans identifiants : **401 Unauthorized**, avec l'en-tête `WWW-Authenticate: Basic realm="Realm"`.
  Toute l'API est verrouillée par défaut.
- Spring Security crée un utilisateur temporaire `user` avec un mot de passe aléatoire
  affiché dans les logs (`Using generated security password: ...`), géré en mémoire
  (`inMemoryUserDetailsManager`). Avec `-u user:<mot de passe généré>` : **200**.
- Avec `-u alice:alice123` : **401**, alors que les identifiants sont corrects.
  Spring Security ne connaît pas encore les utilisateurs de la base.
- On remarque aussi un cookie `JSESSIONID` : Spring crée une session par défaut.
### Étape 2 : bean `PasswordEncoder` (BCrypt)

- Déclaré dans `config/SecurityConfig` : `new BCryptPasswordEncoder()`, le même algorithme
  que celui utilisé par `DonneesDemo` pour hacher les mots de passe en base.
- Rôle : comparer le mot de passe reçu au hash stocké. BCrypt est à sens unique : il ne
  « déchiffre » pas, il hache à nouveau le mot de passe reçu (avec le sel contenu dans le hash)
  et compare.
- Résultat : alice reçoit toujours **401**. Spring sait maintenant **comment vérifier** un mot
  de passe, mais pas encore **où trouver** les utilisateurs de la base (étape 3).
- L'utilisateur temporaire `user` est toujours créé (la ligne `generated security password`
  reste dans les logs), mais son mot de passe généré n'est pas un hash BCrypt.
### Étape 3 : `UserDetailsService`

- Bean déclaré dans `SecurityConfig` : il charge l'`Utilisateur` en base par son login
  (`UtilisateurRepository.findByLogin`) et le traduit en `UserDetails` Spring Security
  (login, hash BCrypt, rôle). Login inconnu : `UsernameNotFoundException`.
- `.roles(...)` ajoute automatiquement le préfixe `ROLE_` (ex. `ROLE_CLIENT`).
- La ligne `generated security password` disparaît des logs : Spring n'a plus besoin
  de son utilisateur temporaire.
- Résultats sur `/api/me` :
  - `alice:alice123` : **200**, `{"login":"alice","roles":["CLIENT"]}`
  - `alice:mauvais` : **401**
  - `inconnu:test` : **401**
- **Limite constatée :** avec `bruno:bruno123`, la réponse est 200 mais indique
  `"login":"alice"`. Spring Security authentifie bien bruno, mais `MeController` utilise
  encore `UtilisateurCourantFake`, qui répond toujours « alice » (corrigé à l'étape 6).
### Étape 4 : `SecurityFilterChain`

Configuration : CSRF désactivé, sessions `STATELESS`, `/api/**` authentifié, le reste libre,
Basic Auth.

**Constat avant la modification :** `POST /api/virements/1/valider` avec `-u alice:alice123`
renvoie **401**, alors que les identifiants sont corrects et que les `GET` passent.
Le filtre CSRF est placé **avant** le filtre Basic Auth : il rejette le POST (pas de jeton CSRF)
alors que l'utilisateur est encore considéré comme anonyme, d'où un 401.

**Après la modification :**

- `POST /api/virements/1/valider` (alice) : **409** (virement déjà validé). La requête
  atteint le controller : le CSRF ne bloque plus.
- `GET /api/me` (alice) : **200**, et plus de cookie `JSESSIONID` : aucune session n'est créée.
- `GET /api/me` sans identifiants : **401**.
- Alice (cliente) peut encore tenter de valider : l'autorisation par rôle est traitée en partie 3.

**Piège CSRF : que faut-il en faire, et pourquoi ?**

Le CSRF (Cross-Site Request Forgery) exploite le fait que le navigateur **ajoute automatiquement
le cookie de session** à toute requête vers le site, même si elle part d'un site malveillant.
La protection CSRF exige un jeton secret que le site malveillant ne peut pas connaître.

Ici, l'API est **stateless** : il n'y a pas de session ni de cookie. Les identifiants sont envoyés
explicitement par le front dans l'en-tête `Authorization`, qu'un site tiers ne peut pas ajouter.
L'attaque n'a donc pas de prise et on peut **désactiver** le CSRF. Ce choix n'est valable que
parce que l'API est stateless : avec une authentification par session/cookie, il faudrait le garder.
### Étape 5 : l'en-tête `Authorization: Basic`

Avec `curl -v -u alice:alice123 localhost:8080/api/me`, curl envoie l'en-tête :

`Authorization: Basic YWxpY2U6YWxpY2UxMjM=`

Décodé (sous PowerShell : `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("..."))`,
équivalent de `base64 -d`) : **`alice:alice123`**.

**Est-ce du chiffrement ?** **Non.** C'est un simple **encodage Base64** : réversible par
n'importe qui, sans clé. Le Basic Auth transmet donc le login et le mot de passe pratiquement
en clair, **à chaque requête** (puisque l'API est stateless).

| | Encodage (Base64) | Chiffrement (TLS) | Hachage (BCrypt) |
|---|---|---|---|
| But | transporter | cacher | vérifier sans stocker l'original |
| Réversible | oui, par tous | oui, avec la clé | non |
| Dans le TD | en-tête `Authorization` | HTTPS (absent en local) | mots de passe en base |

**Conséquence :** le Basic Auth ne doit être utilisé qu'avec **HTTPS**, qui chiffre toute la
connexion (en-têtes compris). En `http://localhost` pour le TD c'est acceptable, jamais en production.
### Étape 6 : `UtilisateurCourant` lu dans le `SecurityContext`

- Nouvelle classe `utilisateur/out/UtilisateurCourantSecurite`, qui implémente l'interface
  `UtilisateurCourant` : elle lit `SecurityContextHolder.getContext().getAuthentication()`,
  renvoie vide si personne n'est authentifié (ou utilisateur anonyme), sinon charge
  l'`Utilisateur` en base par `auth.getName()`.
- `UtilisateurCourantFake` supprimé (sinon deux beans `UtilisateurCourant` : l'appli ne démarre pas),
  ainsi que la propriété `app.utilisateur-fake` dans `application.yml`.
- Grâce à l'interface, `MeController` et `VirementService` n'ont pas été modifiés.

**Résultats :**

- `bruno:bruno123` sur `/api/me` : `{"login":"bruno","roles":["CONSEILLER"]}`
  (avant : `"login":"alice"`).
- `alice:alice123` sur `/api/me` : `{"login":"alice","roles":["CLIENT"]}`.
- bruno valide le virement 3 : **200**, `"validePar":"bruno"`. La traçabilité de la
  validation est correcte (avant, tous les virements étaient « validés par alice »).
### Étape 7 : CORS dans la chaîne de sécurité

- Le front (`localhost:4200`) et l'API (`localhost:8080`) ont des origines différentes.
  Avant une requête avec l'en-tête `Authorization`, le navigateur envoie une requête de
  permission (**preflight**) `OPTIONS`, **sans identifiants**. La chaîne de sécurité exige
  une authentification sur `/api/**` : elle répondait 401 et le navigateur bloquait l'appel.
- Correction : `.cors(Customizer.withDefaults())` dans la `SecurityFilterChain`. Spring Security
  traite le CORS en premier, avec la configuration existante de `CorsConfig`.
- Test (simulation du preflight) :
  `curl -i -X OPTIONS localhost:8080/api/comptes -H "Origin: http://localhost:4200" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"`
  : **200** avec `Access-Control-Allow-Origin: http://localhost:4200`,
  `Access-Control-Allow-Headers: authorization`.
- `GET /api/comptes` sans identifiants reste en **401** : le CORS autorise la demande de
  permission, pas l'accès aux données.
## Partie 2

### Étape 2.1 : `AuthService.connecter`

- Construit l'en-tête `Basic` avec `btoa('login:motDePasse')`, appelle `GET /api/me` avec
  cet en-tête. En cas de 401, `HttpClient` lève une erreur : rien n'est mémorisé et la page
  de login affiche « Identifiant ou mot de passe incorrect ».
- En cas de succès : l'en-tête est gardé **en mémoire** (simple champ du service) et le signal
  `utilisateur` est renseigné (la barre affiche « alice (CLIENT) »).
- `deconnecter` oublie l'en-tête et l'utilisateur.
- Constat : la connexion fonctionne, mais la page des comptes affiche « Impossible de charger
  les comptes » : les autres requêtes partent **sans** l'en-tête `Authorization`, et l'API
  stateless répond 401 (corrigé par l'intercepteur, étape 2.2).
### Étape 2.2 : intercepteur fonctionnel (`HttpInterceptorFn`)

- Fichier `ui/src/app/core/auth/auth.interceptor.ts`, enregistré dans `app.config.ts` avec
  `provideHttpClient(withInterceptors([authInterceptor]))`.
- Pour les requêtes vers l'API uniquement (`req.url.startsWith(API)`), il ajoute l'en-tête
  `Authorization` mémorisé par `AuthService` (via `req.clone({ setHeaders: ... })`, car une
  requête Angular est immuable). On n'envoie jamais les identifiants à un autre site.
- Sur un **401**, il déconnecte et renvoie vers `/login`, puis relaie l'erreur (`throwError`).
  Exception : la requête de connexion elle-même (elle porte déjà son propre en-tête). Un 401
  y signifie « mauvais mot de passe » et doit juste afficher le message d'erreur.
- Résultat : après connexion, la liste des comptes s'affiche. Alice voit les 3 comptes
  (y compris ceux de Charles et Diane) : les droits sont traités en partie 3.

Sources : documentation Angular (`HttpInterceptorFn`, `withInterceptors`) ; Stack Overflow,
« How to make angular response to http 401 » (question 56663931) pour le schéma
`catchError` → 401 → déconnexion et redirection.
### Étape 2.3 : guard (`CanActivateFn`)

- Fichier `ui/src/app/core/auth/auth.guard.ts` : si `AuthService.utilisateur()` est renseigné,
  on laisse passer ; sinon on renvoie une redirection
  `router.createUrlTree(['/login'], { queryParams: { retour: state.url } })`.
- Appliquée avec `canActivate: [authGuard]` aux routes `comptes` et `comptes/:id`
  (pas à `login`, sinon on ne pourrait jamais se connecter).
- Test : connecté sur `/comptes/1`, rechargement (F5) : redirection vers
  `/login?retour=%2Fcomptes%2F1`. Après connexion, retour direct sur `/comptes/1`
  (la page de login fournie lit le paramètre `retour`).
### Étape 2.4 : tests de la page de login

**Mauvais mot de passe** (`alice` / `faux`) : le message « Identifiant ou mot de passe incorrect. »
s'affiche et on reste sur `/login`. L'API répond 401 à `GET /api/me`, `HttpClient` lève une erreur,
`connecter` ne mémorise rien, et la page de login affiche le message dans son `catch`.
L'intercepteur ne redirige pas, car la requête de connexion porte déjà son propre en-tête.

**Rechargement de la page en étant connecté : que se passe-t-il ?** On est déconnecté : la guard
renvoie vers `/login?retour=<page>`, puis, après reconnexion, on revient sur la page demandée.

**Pourquoi ?** Les identifiants sont gardés **en mémoire** (un champ de `AuthService`). Recharger
la page relance l'application Angular de zéro et efface toutes les variables. L'API étant
**stateless**, elle ne garde pas non plus de session : il ne reste aucune trace de la connexion.

**Pourquoi ne pas les stocker dans `localStorage` / `sessionStorage` ?** En Basic Auth, ce qu'on
stockerait serait le **mot de passe lui-même**, seulement encodé en Base64. Tout script exécuté
dans la page (par exemple via une faille XSS) pourrait le lire et le voler, et avec `localStorage`
il resterait sur le disque. Devoir se reconnecter après un rechargement est le prix de cette
sécurité. Une vraie appli utiliserait plutôt un jeton temporaire (JWT, session), jamais le mot de passe.