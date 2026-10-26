# Control Industrial de Producción e Inventario de Armaduras (Stack MERN)

Aplicación web completa optimizada para tablets y pantallas táctiles en planta industrial, diseñada para el registro diario por turnos de lotes de **armaduras estabilizadas**, comparativa contra el **contador de máquina**, cálculo de diferencias/mermas y **Panel de Supervisión** con exportación a Excel (CSV).

## Estructura del Proyecto

```text
controlArmaduras/
├── servidor/                          # Backend (Node.js + Express + Mongoose)
│   ├── configuracion/
│   │   └── baseDatos.js               # Conexión a MongoDB
│   ├── modelos/
│   │   └── Turno.js                   # Esquema Mongoose del Turno y registros parciales
│   ├── middlewares/
│   │   └── autenticacionSupervisor.js # Verificación de clave de supervisor
│   ├── controladores/
│   │   └── turnoControlador.js        # Lógica de negocio, cierres y estadísticas
│   ├── rutas/
│   │   └── turnoRutas.js              # Endpoints REST (/api/turnos)
│   ├── .env.example                   # Plantilla de variables de entorno
│   ├── index.js                       # Punto de entrada del servidor Express
│   └── package.json
│
└── cliente/                           # Frontend (React + Vite + Tailwind CSS + Lucide React)
    ├── src/
    │   ├── componentes/
    │   │   ├── BarraNavegacion.jsx    # Barra superior con estado y botón "Acceso Supervisor"
    │   │   ├── FormularioRegistro.jsx # Gestión de Turno (3 operadores) y Registro Parcial
    │   │   ├── TablaParciales.jsx     # Tabla en tiempo real y cierre "Terminar Turno"
    │   │   ├── ModalSupervisor.jsx    # Modal con teclado táctil para PIN de supervisor
    │   │   └── PanelSupervisor.jsx    # Estadísticas, comparativa de turnos y exportar CSV
    │   ├── servicios/
    │   │   └── apiTurnos.js           # Cliente HTTP fetch hacia el backend
    │   ├── utilidades/
    │   │   └── exportarExcel.js       # Generador de archivo CSV compatible con Excel
    │   ├── Aplicacion.jsx             # Componente raíz de estado y flujo operativo
    │   ├── principal.jsx              # Punto de montaje de React
    │   └── estilos.css                # Directivas de Tailwind CSS
    ├── .env.example
    ├── index.html
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── vite.config.js
    └── package.json
```

## Requisitos Previos

- **Node.js** v18 o superior
- **MongoDB** (instancia local en `mongodb://127.0.0.1:27017/control_armaduras` o URI de MongoDB Atlas)

## Instalación y Ejecución Rápida

### 1. Levantar el Servidor (`/servidor`)

```bash
cd servidor
npm install
npm run desarrollo
```

### 2. Levantar el Cliente (`/cliente`)

En otra terminal:

```bash
cd cliente
npm install
npm run desarrollo
```

- **Frontend en Planta:** `http://localhost:5173`
- **API Backend:** `http://localhost:5000/api/turnos`
- **Clave por defecto del Supervisor:** `1234` (configurable en `servidor/.env` mediante `CLAVE_SUPERVISOR`)

