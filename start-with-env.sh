#!/bin/bash
# Script wrapper pour charger le .env avant de lancer le serveur MCP

set -a  # Auto-export toutes les variables

# Charger les variables d'environnement depuis /root/.env
if [ -f /root/.env ]; then
    # Lecture simple ligne par ligne
    while IFS='=' read -r key value; do
        # Ignorer les lignes vides et les commentaires
        if [[ -n "$key" && ! "$key" =~ ^# ]]; then
            # Supprimer les guillemets autour de la valeur si présents
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            # Exporter la variable
            export "$key=$value"
        fi
    done < /root/.env
fi

set +a

# Ne jamais logger de secrets (tokens) dans stdout/stderr.

# Changer de répertoire et lancer le BUILD COMPILÉ (pas tsx/src)
cd /root/meta-mcp
exec node build/src/index.js "$@"
