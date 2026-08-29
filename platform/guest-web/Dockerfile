FROM node:22-alpine AS build
WORKDIR /web
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
COPY platform/guest-web/package*.json ./
RUN npm ci
COPY platform/guest-web/ ./
# LandingPage comparte la imagen principal con la aplicación del DJ.
COPY desktop/frontend/src/assets/header-party-dj-v5.png /desktop/frontend/src/assets/header-party-dj-v5.png
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /web/dist /usr/share/nginx/html
