/**
 * BEMHES 2027 — API WEB APP PARA CRUD NAS 8 ABAS DA PLANILHA GOOGLE
 */
const ABAS_PERMITIDAS = [
  'MUNICIPIO',
  'Código de Industria',
  'CLIENTES',
  'Clientes Endereço Cobrança',
  'Clientes Endereço Entrega',
  'GRUPO FAMILIAR',
  'USUÁRIO',
  'COMPRADOR'
];

function normalizarChave(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function obterAbaPorNome(ss, nomeAbaSolicitado) {
  const alvo = normalizarChave(nomeAbaSolicitado);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (normalizarChave(sheets[i].getName()) === alvo) {
      return sheets[i];
    }
  }
  return null;
}

function responderJSON(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET: Leitura em tempo real de qualquer uma das 8 abas
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const acao = (params.action || 'ping').toLowerCase();
    const abaNome = params.sheet || '';

    if (acao === 'ping') {
      return responderJSON({
        status: 'ok',
        mensagem: 'API BEMHES 2027 ativa.',
        abasSuportadas: ABAS_PERMITIDAS
      });
    }

    if (acao === 'list' && abaNome) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = obterAbaPorNome(ss, abaNome);
      if (!sheet) {
        return responderJSON({ status: 'erro', mensagem: 'Aba não encontrada: ' + abaNome });
      }
      const dados = sheet.getDataRange().getDisplayValues();
      if (dados.length === 0) {
        return responderJSON({ status: 'ok', headers: [], rows: [] });
      }
      const headers = dados[0].map(h => String(h).trim());
      const rows = [];
      for (let r = 1; r < dados.length; r++) {
        const obj = { _rowNumber: r + 1 };
        let temValor = false;
        for (let c = 0; c < headers.length; c++) {
          const h = headers[c] || ('COL_' + (c + 1));
          obj[h] = dados[r][c];
          if (String(dados[r][c]).trim() !== '') temValor = true;
        }
        if (temValor) rows.push(obj);
      }
      return responderJSON({ status: 'ok', sheet: sheet.getName(), headers: headers, rows: rows });
    }

    return responderJSON({ status: 'erro', mensagem: 'Ação GET inválida.' });
  } catch (err) {
    return responderJSON({ status: 'erro', mensagem: err.toString() });
  }
}

// POST: Adicionar (create), Editar (update) e Excluir (delete)
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responderJSON({ status: 'erro', mensagem: 'Corpo da requisição vazio.' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || '').toLowerCase();
    const sheetName = payload.sheet;
    const record = payload.record || {};
    const keyField = payload.keyField || '';
    const keyValue = payload.keyValue !== undefined ? String(payload.keyValue).trim() : '';
    const rowNumber = payload.rowNumber ? parseInt(payload.rowNumber, 10) : null;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obterAbaPorNome(ss, sheetName);

    if (!sheet) {
      return responderJSON({ status: 'erro', mensagem: 'Aba não encontrada: ' + sheetName });
    }

    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();

    let headers = [];
    if (lastCol > 0 && lastRow >= 1) {
      headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(h => String(h).trim());
    } else {
      headers = Object.keys(record).filter(k => !k.startsWith('_'));
      if (headers.length > 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }

    const mapaHeaders = {};
    headers.forEach((h, idx) => {
      mapaHeaders[normalizarChave(h)] = idx;
    });

    // Cria automaticamente colunas novas caso enviadas pelo formulário
    Object.keys(record).forEach(chave => {
      if (chave.startsWith('_')) return;
      const cNorm = normalizarChave(chave);
      if (cNorm && mapaHeaders[cNorm] === undefined) {
        headers.push(chave);
        mapaHeaders[cNorm] = headers.length - 1;
        sheet.getRange(1, headers.length).setValue(chave);
      }
    });

    function encontrarLinhaAlvo() {
      const totalLinhas = sheet.getLastRow();
      if (totalLinhas < 2) return -1;

      const dados = sheet.getRange(2, 1, totalLinhas - 1, headers.length).getDisplayValues();

      if (keyField && keyValue !== '') {
        const colIdx = mapaHeaders[normalizarChave(keyField)];
        if (colIdx !== undefined) {
          const alvoVal = normalizarChave(keyValue);
          for (let i = 0; i < dados.length; i++) {
            if (normalizarChave(dados[i][colIdx]) === alvoVal) {
              return i + 2;
            }
          }
        }
      }

      if (rowNumber && rowNumber >= 2 && rowNumber <= totalLinhas) {
        return rowNumber;
      }

      return -1;
    }

    if (action === 'create') {
      const novaLinha = new Array(headers.length).fill('');
      Object.keys(record).forEach(chave => {
        if (chave.startsWith('_')) return;
        const idx = mapaHeaders[normalizarChave(chave)];
        if (idx !== undefined) {
          novaLinha[idx] = record[chave] !== null && record[chave] !== undefined ? String(record[chave]) : '';
        }
      });

      sheet.appendRow(novaLinha);
      return responderJSON({
        status: 'ok',
        action: 'create',
        sheet: sheet.getName(),
        rowNumber: sheet.getLastRow(),
        mensagem: 'Registro adicionado com sucesso!'
      });
    }

    if (action === 'update') {
      const targetRow = encontrarLinhaAlvo();
      if (targetRow === -1) {
        return responderJSON({
          status: 'erro',
          mensagem: 'Registro não encontrado para edição na aba ' + sheet.getName()
        });
      }

      const linhaAtual = sheet.getRange(targetRow, 1, 1, headers.length).getDisplayValues()[0];
      Object.keys(record).forEach(chave => {
        if (chave.startsWith('_')) return;
        const idx = mapaHeaders[normalizarChave(chave)];
        if (idx !== undefined) {
          linhaAtual[idx] = record[chave] !== null && record[chave] !== undefined ? String(record[chave]) : '';
        }
      });

      sheet.getRange(targetRow, 1, 1, headers.length).setValues([linhaAtual]);
      return responderJSON({
        status: 'ok',
        action: 'update',
        sheet: sheet.getName(),
        rowNumber: targetRow,
        mensagem: 'Registro atualizado com sucesso!'
      });
    }

    if (action === 'delete') {
      const targetRow = encontrarLinhaAlvo();
      if (targetRow === -1) {
        return responderJSON({
          status: 'erro',
          mensagem: 'Registro não encontrado para exclusão na aba ' + sheet.getName()
        });
      }

      sheet.deleteRow(targetRow);
      return responderJSON({
        status: 'ok',
        action: 'delete',
        sheet: sheet.getName(),
        deletedRow: targetRow,
        mensagem: 'Registro excluído com sucesso!'
      });
    }

    return responderJSON({ status: 'erro', mensagem: 'Ação inválida: ' + action });
  } catch (err) {
    return responderJSON({ status: 'erro', mensagem: err.toString() });
  } finally {
    lock.releaseLock();
  }
}