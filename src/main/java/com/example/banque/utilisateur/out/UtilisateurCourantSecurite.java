package com.example.banque.utilisateur.out;

import java.util.Optional;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.example.banque.utilisateur.Utilisateur;
import com.example.banque.utilisateur.UtilisateurRepository;

/** L'utilisateur courant, lu dans le SecurityContext rempli par Spring Security. */
@Component
public class UtilisateurCourantSecurite implements UtilisateurCourant {

    private final UtilisateurRepository utilisateurs;

    public UtilisateurCourantSecurite(UtilisateurRepository utilisateurs) {
        this.utilisateurs = utilisateurs;
    }

    @Override
    public Optional<Utilisateur> get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return Optional.empty();
        }
        return utilisateurs.findByLogin(auth.getName());
    }
}