/**
 * Middleware para verificar la clave de acceso del supervisor
 * configurada en las variables de entorno (CLAVE_SUPERVISOR).
 */
const verificarSupervisor = (req, res, next) => {
  const claveConfigurada = process.env.CLAVE_SUPERVISOR || '1234';
  const claveRecibida =
    req.headers['x-clave-supervisor'] ||
    (req.body && req.body.clave) ||
    (req.query && req.query.clave);

  if (!claveRecibida) {
    return res.status(401).json({
      exito: false,
      mensaje: 'Se requiere la clave de supervisor para acceder a este recurso.'
    });
  }

  if (String(claveRecibida).trim() !== String(claveConfigurada).trim()) {
    return res.status(403).json({
      exito: false,
      mensaje: 'Clave de supervisor incorrecta. Acceso denegado.'
    });
  }

  next();
};

module.exports = { verificarSupervisor };

