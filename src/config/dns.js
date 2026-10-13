import dns from 'dns';
import config from './config.js';
import logger from './logger.js';

/**
 * Local workaround for machines whose DNS can't answer SRV lookups, which `mongodb+srv://`
 * (Atlas) connection strings need: Node then fails with `querySrv ECONNREFUSED`.
 * Set DNS_SERVERS=8.8.8.8 in that machine's .env. Servers (Railway, VPS) leave it unset, so
 * this does nothing there. Call it before mongoose.connect.
 */
const applyDnsOverride = () => {
  if (config.dnsServers.length === 0) return;
  dns.setServers(config.dnsServers);
  dns.setDefaultResultOrder('ipv4first');
  logger.info(`DNS override from DNS_SERVERS: ${config.dnsServers.join(', ')}`);
};

export default applyDnsOverride;
