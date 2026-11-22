# Finova — socle technique initial

Ce dépôt contient le premier socle de l'application Finova : interface React/Vite, thème sombre responsive, client Supabase et première migration PostgreSQL avec RLS.

> Les chiffres de démonstration du graphique sont volontairement masqués dans l'interface. Aucune donnée patrimoniale fictive n'est affichée comme réelle.

## Prérequis

- Node.js LTS
- Un projet Supabase
- Un compte Google pour l'authentification OAuth

## Installation sous Windows

1. Décompresser le projet.
2. Ouvrir le dossier dans VS Code.
3. Ouvrir un terminal dans ce dossier.
4. Exécuter :

```bash
npm install
copy .env.example .env
npm run dev
```

5. Ouvrir l'adresse locale indiquée par Vite.

## Configuration Supabase

1. Créer un projet Supabase.
2. Dans SQL Editor, exécuter `supabase/migrations/0001_initial_schema.sql`.
3. Dans Authentication > Providers, configurer Google OAuth.
4. Dans Authentication > URL Configuration, renseigner l'URL locale et les URL de production autorisées.
5. Copier l'URL du projet et la clé publique/publishable dans `.env` :

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

6. Redémarrer `npm run dev`.

### Accès privé

Le schéma active RLS et isole chaque ligne par `auth.uid()`. Pour le lancement privé à un seul utilisateur, configure l'accès Google de façon restrictive dans Supabase et vérifie l'adresse autorisée côté serveur avant d'ouvrir l'application en production. Ne place jamais une clé `service_role` dans le frontend.

La désactivation des inscriptions seule n'est pas suffisante pour sécuriser un fournisseur OAuth déjà configuré : il faut tester le parcours complet avec un compte autorisé et un compte non autorisé avant mise en production.

## Déploiement

Le frontend peut être déployé sur Cloudflare Pages avec :
- commande de build : `npm run build`
- dossier de sortie : `dist`
- variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Étape suivante

- Ajouter la gestion des comptes et des actifs.
- Ajouter les formulaires de positions manuelles (quantité + PRU).
- Relier les cours de marché côté serveur, sans exposer les clés API.
- Ajouter les calculs patrimoniaux et les historiques.

## Modèle de données

Les cours sont rattachés à l'actif, tandis que les positions (quantité et PRU) sont rattachées au compte. Le même actif peut donc être détenu sur plusieurs comptes avec des PRU distincts et un cours de marché commun.

La migration initiale est un point de départ à auditer avant production, notamment les règles d'appartenance inter-tables et les contrôles d'accès au compte unique.
