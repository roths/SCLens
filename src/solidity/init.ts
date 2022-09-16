'use strict';
import Web3 from 'web3';
import { Method } from 'web3-core-method';

export function loadWeb3(url: string) {
  if (!url) {
    url = 'http://localhost:8545';
  }
  const web3 = new Web3();
  web3.setProvider(new Web3.providers.HttpProvider(url));
  extend(web3);
  return web3;
}

export function extend(web3: Web3) {
  if (!web3.extend) {
    return;
  }
  // DEBUG
  const methods: Method[] = [];
  const web3Any = web3 as any;
  if (!(web3Any.debug && web3Any.debug.preimage)) {
    methods.push({
      name: 'preimage',
      call: 'debug_preimage',
      inputFormatter: [null],
      params: 1
    });
  }

  if (!(web3Any.debug && web3Any.debug.traceTransaction)) {
    methods.push({
      name: 'traceTransaction',
      call: 'debug_traceTransaction',
      inputFormatter: [null, null],
      params: 2
    });
  }

  if (!(web3Any.debug && web3Any.debug.storageRangeAt)) {
    methods.push({
      name: 'storageRangeAt',
      call: 'debug_storageRangeAt',
      inputFormatter: [null, null, null, null, null],
      params: 5
    });
  }
  if (methods.length > 0) {
    web3.extend({
      property: 'debug',
      methods: methods,
    });
  }
}
