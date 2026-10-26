const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Establece la conexión con la base de datos MongoDB utilizando Mongoose,
 * asegurando que siempre se utilice la base de datos "control_armaduras".
 */
const conectarBaseDatos = async () => {
  try {
    const uri = process.env.MONGO_URI;
    const conexion = await mongoose.connect(uri, {
      dbName: 'control_armaduras'
    });

    console.log(
      `[Base de Datos] MongoDB conectado exitosamente en: ${conexion.connection.host} (Base de datos: ${conexion.connection.name})`
    );
  } catch (error) {
    console.error(`[Base de Datos] Error al conectar con MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = conectarBaseDatos;
