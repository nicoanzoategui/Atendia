# # UI Skills & Design Guidelines
## Attendance App

Este documento define los lineamientos de **UI y diseño visual** para la aplicación de asistencia.

Su objetivo es asegurar consistencia visual, simplicidad de interfaz y uso correcto del sistema de componentes.

Este archivo NO define lógica de negocio ni flujos de producto.
Solo establece reglas de **interfaz visual**.

---

# UI Framework

La aplicación debe construirse utilizando **Flowbite** como librería principal de componentes.

Flowbite está basado en **TailwindCSS**, por lo que todos los estilos deben seguir ese sistema.

Reglas:

- No crear componentes personalizados si Flowbite ya provee uno.
- Mantener consistencia visual usando únicamente el sistema de Flowbite.
- Evitar CSS custom innecesario.
- Utilizar clases Tailwind estándar.

---

# Componentes permitidos

Los siguientes componentes de Flowbite deben ser la base del sistema de interfaz.

## Layout

- Container
- Grid
- Flex
- Card
- Divider
- Section

## Navigation

- Navbar
- Breadcrumb
- Tabs

## Inputs

- Input
- Select
- Checkbox
- Toggle
- File Upload

## Actions

- Buttons
- Dropdown
- Modal

## Feedback

- Alert
- Toast
- Badge
- Spinner

## Data display

- Table
- List
- Avatar
- Timeline

---

# Responsive Design

La aplicación debe ser **100% responsive**.

El diseño debe seguir un enfoque **mobile-first**.

Breakpoints sugeridos:

- Mobile
- Tablet
- Desktop

Principios:

- evitar layouts complejos en mobile
- usar grids adaptativos
- botones grandes y claros
- evitar scroll horizontal
- priorizar acciones visibles

---

# Color System

La aplicación debe utilizar la escala de colores basada en **Tailwind / Flowbite color palette**.

Cada color utiliza niveles:

900
800
700
600
500
400
300
200
100
50

---

# Color base

La estructura general del sistema debe utilizar **grayscale**.

Uso recomendado:

gray-900 → títulos
gray-700 → texto principal
gray-500 → texto secundario
gray-300 → bordes
gray-100 → contenedores
gray-50 → fondo principal

Esto asegura una interfaz limpia y consistente.

---

# Colores funcionales

Los colores deben usarse de forma **funcional**, no decorativa.

## Green

Usar para estados positivos o confirmaciones.

Ejemplos:

green-500
green-600

---

## Yellow

Usar para advertencias o estados intermedios.

Ejemplos:

yellow-400
yellow-500

---

## Red

Usar para errores o estados críticos.

Ejemplos:

red-500
red-600

---

## Orange

Usar para procesos activos o información relevante.

Ejemplo:

orange-500

---

## Purple / Pink

Uso limitado para diferenciación visual secundaria.

Evitar uso excesivo.

---

# Uso de badges

Los badges deben utilizarse para representar estados.

Ejemplos de uso:

- estado
- categorías
- indicadores rápidos

Los badges deben utilizar colores del sistema definido.

---

# Tipografía

Utilizar tipografía limpia y legible.

Principios:

- títulos claros
- jerarquía visual simple
- evitar exceso de estilos
- priorizar legibilidad en mobile

---

# Espaciado

Utilizar spacing consistente basado en Tailwind.

Evitar márgenes arbitrarios.

Utilizar escalas estándar.

---

# Iconografía

Si se utilizan íconos deben provenir de:

- Heroicons
- Flowbite icons

Evitar iconografía externa inconsistente.

---

# Principios visuales

La interfaz debe ser:

simple
clara
consistente
rápida de interpretar

Evitar:

interfaces recargadas
exceso de colores
componentes innecesarios

---

# Regla final

La interfaz debe sentirse como una **herramienta clara y operativa**, priorizando simplicidad y consistencia visual mediante Flowbite.