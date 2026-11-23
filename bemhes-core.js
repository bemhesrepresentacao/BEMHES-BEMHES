/**
 * ============================================================================
 * BEMHES 2027 — NÚCLEO COMPARTILHADO (bemhes-core.js)
 * ============================================================================
 * Integra todas as 8 páginas ao mesmo Google Sheets publicado e ao Apps Script
 * para Adicionar, Editar e Excluir registros diretamente na planilha, mantendo
 * os relacionamentos definidos no diagrama de entidades.
 * ============================================================================
 */

// 1. CONFIGURAÇÃO DA PLANILHA GOOGLE PUBLICADA (LEITURA)
const PUB_ID_PRINCIPAL = '2PACX-1vTSl4l8NGRoPzd8UDHmjHbfErHehKlAaXEMHys9VjZSm5yEK3p2w6e5vTzX4jYhZ708PEUpdZYLw81I';
const PUBHTML_PRINCIPAL_URL = `https://docs.google.com/spreadsheets/d/e/${PUB_ID_PRINCIPAL}/pubhtml`;

// Planilha auxiliar opcional (caso "Código de Industria" ainda esteja na planilha secundária)
const PUB_ID_INDUSTRIA_AUX = '2PACX-1vQtpFruGZY0ryne5c70G5pCxJebqVT_B_4ClZjj03cuju-YrkS3P6iZmAxR6tQ4mYU3nigwkg5NXmIZ';
const PUBHTML_INDUSTRIA_AUX_URL = `https://docs.google.com/spreadsheets/d/e/${PUB_ID_INDUSTRIA_AUX}/pubhtml`;

// 2. URL DO GOOGLE APPS SCRIPT (ESCRITA: ADICIONAR / EDITAR / EXCLUIR NA PLANILHA)
// Cole aqui a URL gerada ao implantar o Code.gs como App da Web, ou configure pelo botão "API Planilha" no topo da página!
const APPS_SCRIPT_URL_PADRAO = 'https://script.google.com/macros/s/AKfycbxybMag74ZgUhypNgQIiZ5-pJRnhzYPoW4S2r2D8A-C7oUrg8uBbl5sDdI47UGEeK27/exec';
const STORAGE_SCRIPT_URL_KEY = 'bemhes_2027_apps_script_url';

function obterUrlAppsScript() {
    return (localStorage.getItem(STORAGE_SCRIPT_URL_KEY) || APPS_SCRIPT_URL_PADRAO || '').trim();
}

function salvarUrlAppsScript(url) {
    localStorage.setItem(STORAGE_SCRIPT_URL_KEY, (url || '').trim());
}

// 3. MAPA DE NAVEGAÇÃO ENTRE AS 8 PÁGINAS DO SISTEMA
const PAGINAS_SISTEMA = [
    { id: 'clientes',   label: 'Clientes',           aba: 'CLIENTES',                   arquivo: 'Portal Cliente.html',             icone: 'users' },
    { id: 'cobranca',   label: 'End. Cobrança',      aba: 'Clientes Endereço Cobrança', arquivo: 'Endereço Cobrança.html',          icone: 'credit-card' },
    { id: 'entrega',    label: 'End. Entrega',       aba: 'Clientes Endereço Entrega',  arquivo: 'Endereço Entrega.html',           icone: 'truck' },
    { id: 'grupo',      label: 'Grupo Familiar',     aba: 'GRUPO FAMILIAR',             arquivo: 'Grupo Familiar.html',             icone: 'network' },
    { id: 'comprador',  label: 'Comprador',          aba: 'COMPRADOR',                  arquivo: 'Portal Comprador.html',           icone: 'shopping-bag' },
    { id: 'usuario',    label: 'Usuário',            aba: 'USUÁRIO',                    arquivo: 'Portal Usuario.html',             icone: 'shield' },
    { id: 'municipio',  label: 'Município',          aba: 'MUNICIPIO',                  arquivo: 'Portal Municipio.html',           icone: 'map-pin' },
    { id: 'industria',  label: 'Cód. Indústria',     aba: 'Código de Industria',        arquivo: 'Portal Codigo Industria.html',    icone: 'factory' }
];

// 4. DEFINIÇÃO DAS 8 ENTIDADES, COLUNAS PADRÃO E CORRELACIONAMENTOS (DIAGRAMA)
const CONFIG_ENTIDADES = {
    'CLIENTES': {
        tituloModulo: 'CLIENTE',
        tituloSecao: 'Base de Clientes',
        itemSingular: 'Cliente',
        icone: 'users',
        chavePrimaria: ['ID', 'CODIGO DO CLIENTE'],
        colunasTabela: ['ID', 'CODIGO DO CLIENTE', 'NOME', 'GRUPO FAMILIAR', 'CIDADE', 'ESTADO'],
        colunasPadrao: [
            'ID', 'CODIGO DO CLIENTE', 'NOME', 'GRUPO FAMILIAR', 'CIDADE', 'ESTADO',
            'DATA DE NASCIMENTO', 'FONE FIXO', 'FONE CELULAR1', 'FONE CELULAR2',
            'EMAIL', 'CEP', 'CNPJ', 'CPF', 'COD. DE IND.', 'DESCRICAO CODIGO DE INDUSTRIA',
            'USO E CONSUMO PRÓPRIO', 'INDUSTRIALIZAÇÃO', 'COMERCIALIZAÇÃO'
        ],
        // Relacionamentos partindo de CLIENTES (setas azuis do diagrama):
        // -> MUNICIPIO, Código de Industria, GRUPO FAMILIAR, Clientes Endereço Cobrança, Clientes Endereço Entrega, USUÁRIO, COMPRADOR
        relacoes: [
            { campoLocal: 'CIDADE', abaOrigem: 'MUNICIPIO', campoOrigem: ['MUNICIPIO', 'CIDADE'], preencherCampoLocal: 'ESTADO', campoOrigemDestino: ['ESTADO', 'UF'], labelExtra: 'Aba MUNICIPIO' },
            { campoLocal: 'DESCRICAO CODIGO DE INDUSTRIA', abaOrigem: 'Código de Industria', campoOrigem: ['DESCRICAO', 'DESCRICAO CODIGO DE INDUSTRIA'], preencherCampoLocal: 'COD. DE IND.', campoOrigemDestino: ['COD. DE IND.', 'CODIGO'], labelExtra: 'Aba Código de Industria' },
            { campoLocal: 'GRUPO FAMILIAR', abaOrigem: 'GRUPO FAMILIAR', campoOrigem: ['GRUPO FAMILIAR', 'NOME', 'DESCRICAO'], labelExtra: 'Aba GRUPO FAMILIAR' }
        ],
        subTabelasDetalhe: [
            { titulo: 'Endereços de Cobrança Vinculados', aba: 'Clientes Endereço Cobrança', icone: 'credit-card' },
            { titulo: 'Endereços de Entrega Vinculados', aba: 'Clientes Endereço Entrega', icone: 'truck' },
            { titulo: 'Compradores Vinculados', aba: 'COMPRADOR', icone: 'shopping-bag' },
            { titulo: 'Usuários Vinculados', aba: 'USUÁRIO', icone: 'shield' }
        ]
    },
    'MUNICIPIO': {
        tituloModulo: 'MUNICÍPIO',
        tituloSecao: 'Cadastro de Municípios',
        itemSingular: 'Município',
        icone: 'map-pin',
        chavePrimaria: ['ID', 'CODIGO', 'MUNICIPIO', 'CIDADE'],
        colunasTabela: ['ID', 'MUNICIPIO', 'ESTADO', 'CODIGO IBGE'],
        colunasPadrao: ['ID', 'MUNICIPIO', 'ESTADO', 'CODIGO IBGE', 'REGIAO'],
        relacoes: [],
        subTabelasDetalhe: [
            { titulo: 'Clientes neste Município', aba: 'CLIENTES', icone: 'users', campoFiltroLocal: ['MUNICIPIO', 'CIDADE'], campoFiltroAlvo: ['CIDADE', 'MUNICIPIO'] }
        ]
    },
    'Código de Industria': {
        tituloModulo: 'INDÚSTRIA',
        tituloSecao: 'Códigos de Indústria',
        itemSingular: 'Código de Indústria',
        icone: 'factory',
        chavePrimaria: ['COD. DE IND.', 'CODIGO', 'ID', 'DESCRICAO'],
        colunasTabela: ['COD. DE IND.', 'DESCRICAO'],
        colunasPadrao: ['COD. DE IND.', 'DESCRICAO', 'OBSERVACAO'],
        relacoes: [],
        subTabelasDetalhe: [
            { titulo: 'Clientes com este Código de Indústria', aba: 'CLIENTES', icone: 'users', campoFiltroLocal: ['COD. DE IND.', 'CODIGO'], campoFiltroAlvo: ['COD. DE IND.', 'CODIGO DE INDUSTRIA'] }
        ]
    },
    'Clientes Endereço Cobrança': {
        tituloModulo: 'COBRANÇA',
        tituloSecao: 'Endereços de Cobrança dos Clientes',
        itemSingular: 'Endereço de Cobrança',
        icone: 'credit-card',
        chavePrimaria: ['ID', 'CODIGO DO CLIENTE', 'CLIENTE'],
        colunasTabela: ['ID', 'CODIGO DO CLIENTE', 'CLIENTE', 'ENDERECO', 'CIDADE', 'ESTADO', 'CEP'],
        colunasPadrao: ['ID', 'CODIGO DO CLIENTE', 'CLIENTE', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CIDADE', 'ESTADO', 'CEP', 'TELEFONE', 'EMAIL COBRANCA'],
        // Diagrama: CLIENTES -> Clientes Endereço Cobrança (azul) e Clientes Endereço Cobrança -> MUNICIPIO (vermelha)
        relacoes: [
            { campoLocal: 'CLIENTE', abaOrigem: 'CLIENTES', campoOrigem: ['NOME', 'CLIENTE'], preencherCampoLocal: 'CODIGO DO CLIENTE', campoOrigemDestino: ['CODIGO DO CLIENTE', 'ID'], labelExtra: 'Aba CLIENTES' },
            { campoLocal: 'CIDADE', abaOrigem: 'MUNICIPIO', campoOrigem: ['MUNICIPIO', 'CIDADE'], preencherCampoLocal: 'ESTADO', campoOrigemDestino: ['ESTADO', 'UF'], labelExtra: 'Aba MUNICIPIO' }
        ],
        subTabelasDetalhe: []
    },
    'Clientes Endereço Entrega': {
        tituloModulo: 'ENTREGA',
        tituloSecao: 'Endereços de Entrega dos Clientes',
        itemSingular: 'Endereço de Entrega',
        icone: 'truck',
        chavePrimaria: ['ID', 'CODIGO DO CLIENTE', 'CLIENTE'],
        colunasTabela: ['ID', 'CODIGO DO CLIENTE', 'CLIENTE', 'ENDERECO', 'CIDADE', 'ESTADO', 'CEP'],
        colunasPadrao: ['ID', 'CODIGO DO CLIENTE', 'CLIENTE', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CIDADE', 'ESTADO', 'CEP', 'PONTO DE REFERENCIA', 'CONTATO RECEBIMENTO'],
        // Diagrama: CLIENTES -> Clientes Endereço Entrega (azul) e Clientes Endereço Entrega -> MUNICIPIO (vermelha)
        relacoes: [
            { campoLocal: 'CLIENTE', abaOrigem: 'CLIENTES', campoOrigem: ['NOME', 'CLIENTE'], preencherCampoLocal: 'CODIGO DO CLIENTE', campoOrigemDestino: ['CODIGO DO CLIENTE', 'ID'], labelExtra: 'Aba CLIENTES' },
            { campoLocal: 'CIDADE', abaOrigem: 'MUNICIPIO', campoOrigem: ['MUNICIPIO', 'CIDADE'], preencherCampoLocal: 'ESTADO', campoOrigemDestino: ['ESTADO', 'UF'], labelExtra: 'Aba MUNICIPIO' }
        ],
        subTabelasDetalhe: []
    },
    'GRUPO FAMILIAR': {
        tituloModulo: 'GRUPO FAMILIAR',
        tituloSecao: 'Grupos Familiares',
        itemSingular: 'Grupo Familiar',
        icone: 'network',
        chavePrimaria: ['ID', 'CODIGO', 'GRUPO FAMILIAR', 'NOME'],
        colunasTabela: ['ID', 'GRUPO FAMILIAR', 'RESPONSAVEL', 'TELEFONE', 'OBSERVACAO'],
        colunasPadrao: ['ID', 'GRUPO FAMILIAR', 'RESPONSAVEL', 'TELEFONE', 'EMAIL', 'OBSERVACAO'],
        relacoes: [],
        // Diagrama: CLIENTES -> GRUPO FAMILIAR e COMPRADOR -> GRUPO FAMILIAR
        subTabelasDetalhe: [
            { titulo: 'Clientes deste Grupo Familiar', aba: 'CLIENTES', icone: 'users', campoFiltroLocal: ['GRUPO FAMILIAR', 'NOME'], campoFiltroAlvo: ['GRUPO FAMILIAR'] },
            { titulo: 'Compradores deste Grupo Familiar', aba: 'COMPRADOR', icone: 'shopping-bag', campoFiltroLocal: ['GRUPO FAMILIAR', 'NOME'], campoFiltroAlvo: ['GRUPO FAMILIAR'] }
        ]
    },
    'USUÁRIO': {
        tituloModulo: 'USUÁRIOS',
        tituloSecao: 'Gestão de Usuários',
        itemSingular: 'Usuário',
        icone: 'shield',
        chavePrimaria: ['ID', 'CODIGO', 'USUARIO', 'NOME', 'EMAIL'],
        colunasTabela: ['ID', 'NOME', 'CLIENTE', 'CODIGO DO CLIENTE', 'EMAIL', 'PERFIL'],
        colunasPadrao: ['ID', 'NOME', 'CODIGO DO CLIENTE', 'CLIENTE', 'EMAIL', 'TELEFONE', 'PERFIL', 'STATUS'],
        // Diagrama: CLIENTES -> USUÁRIO (azul)
        relacoes: [
            { campoLocal: 'CLIENTE', abaOrigem: 'CLIENTES', campoOrigem: ['NOME', 'CLIENTE'], preencherCampoLocal: 'CODIGO DO CLIENTE', campoOrigemDestino: ['CODIGO DO CLIENTE', 'ID'], labelExtra: 'Aba CLIENTES' }
        ],
        subTabelasDetalhe: []
    },
    'COMPRADOR': {
        tituloModulo: 'COMPRADOR',
        tituloSecao: 'Cadastro de Compradores',
        itemSingular: 'Comprador',
        icone: 'shopping-bag',
        chavePrimaria: ['ID', 'CODIGO', 'COMPRADOR', 'NOME'],
        colunasTabela: ['ID', 'NOME', 'CLIENTE', 'GRUPO FAMILIAR', 'FONE CELULAR1', 'EMAIL'],
        colunasPadrao: ['ID', 'NOME', 'CODIGO DO CLIENTE', 'CLIENTE', 'GRUPO FAMILIAR', 'CARGO', 'FONE FIXO', 'FONE CELULAR1', 'EMAIL'],
        // Diagrama: CLIENTES -> COMPRADOR (azul) e COMPRADOR -> GRUPO FAMILIAR (laranja)
        relacoes: [
            { campoLocal: 'CLIENTE', abaOrigem: 'CLIENTES', campoOrigem: ['NOME', 'CLIENTE'], preencherCampoLocal: 'CODIGO DO CLIENTE', campoOrigemDestino: ['CODIGO DO CLIENTE', 'ID'], labelExtra: 'Aba CLIENTES' },
            { campoLocal: 'GRUPO FAMILIAR', abaOrigem: 'GRUPO FAMILIAR', campoOrigem: ['GRUPO FAMILIAR', 'NOME', 'DESCRICAO'], labelExtra: 'Aba GRUPO FAMILIAR' }
        ],
        subTabelasDetalhe: []
    }
};

// ============================================================================
// UTILITÁRIOS DE TEXTO, NORMALIZAÇÃO E MÁSCARAS
// ============================================================================
function normalizarTexto(str) {
    return (str || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function apenasDigitos(valor) {
    return (valor || '').toString().replace(/\D/g, '');
}

function paraInputDate(valor) {
    if (!valor) return '';
    const str = valor.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const matchBR = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (matchBR) return `${matchBR[3]}-${matchBR[2]}-${matchBR[1]}`;
    return '';
}

function paraDataBR(valor) {
    if (!valor) return '';
    const str = valor.toString().trim();
    const matchISO = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (matchISO) return `${matchISO[3]}/${matchISO[2]}/${matchISO[1]}`;
    return str;
}

function formatarFoneFixo(valor) {
    const d = apenasDigitos(valor).slice(0, 10);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

function formatarCelular(valor) {
    const d = apenasDigitos(valor).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatarCEP(valor) {
    const d = apenasDigitos(valor).slice(0, 8);
    if (!d) return '';
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatarCPF(valor) {
    const d = apenasDigitos(valor).slice(0, 11);
    if (!d) return '';
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarCNPJ(valor) {
    const d = apenasDigitos(valor).slice(0, 14);
    if (!d) return '';
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const COLUNAS_SELECAO_SIM_NAO = ['USO E CONSUMO PRÓPRIO', 'INDUSTRIALIZAÇÃO', 'COMERCIALIZAÇÃO'];

function normalizarSelecao(valor) {
    const v = normalizarTexto(valor);
    if (v === 'SIM' || v === 'S' || v === 'TRUE' || v === '1' || v === 'X') return 'SIM';
    if (v === 'NAO' || v === 'NÃO' || v === 'N' || v === 'FALSE' || v === '0') return 'NAO';
    return '';
}

function aplicarFormatacaoPorColuna(coluna, valor) {
    if (valor === null || valor === undefined) return '';
    const colNorm = normalizarTexto(coluna);
    const str = valor.toString().trim();

    if (colNorm.includes('NASCIMENTO') || colNorm.startsWith('DATA')) return paraDataBR(str);
    if (colNorm === 'FONE FIXO') return formatarFoneFixo(str);
    if (colNorm.includes('CELULAR') || colNorm === 'TELEFONE') {
        const dig = apenasDigitos(str);
        return dig.length > 10 ? formatarCelular(str) : formatarFoneFixo(str);
    }
    if (colNorm === 'CEP') return formatarCEP(str);
    if (colNorm === 'CNPJ') return formatarCNPJ(str);
    if (colNorm === 'CPF') return formatarCPF(str);
    if (colNorm.includes('EMAIL') || colNorm.includes('E-MAIL')) return str.toLowerCase();
    if (colNorm === 'ESTADO' || colNorm === 'UF') return str.toUpperCase();
    if (COLUNAS_SELECAO_SIM_NAO.some(s => normalizarTexto(s) === colNorm)) {
        const sel = normalizarSelecao(str);
        return sel === 'NAO' ? 'NÃO' : sel;
    }
    return str;
}

function aplicarMascaraTempoReal(input, colNorm) {
    if (colNorm === 'FONE FIXO') input.value = formatarFoneFixo(input.value);
    else if (colNorm.includes('CELULAR') || colNorm === 'TELEFONE') {
        const dig = apenasDigitos(input.value);
        input.value = dig.length > 10 ? formatarCelular(input.value) : formatarFoneFixo(input.value);
    }
    else if (colNorm === 'CEP') input.value = formatarCEP(input.value);
    else if (colNorm === 'CPF') input.value = formatarCPF(input.value);
    else if (colNorm === 'CNPJ') input.value = formatarCNPJ(input.value);
    else if (colNorm.includes('EMAIL') || colNorm.includes('E-MAIL')) input.value = input.value.replace(/\s+/g, '').toLowerCase();
}

function obterValorCampo(registro, possiveisNomes) {
    if (!registro) return '';
    const lista = Array.isArray(possiveisNomes) ? possiveisNomes : [possiveisNomes];
    for (const nomeAlvo of lista) {
        const alvoNorm = normalizarTexto(nomeAlvo);
        for (const chave of Object.keys(registro)) {
            if (!chave.startsWith('_') && normalizarTexto(chave) === alvoNorm) {
                return registro[chave] || '';
            }
        }
    }
    return '';
}

function gerarIdPadraoMCB(nomeCompleto, prefixo = 'MCB-') {
    const limpo = (nomeCompleto || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .toUpperCase();
    if (!limpo) return prefixo;
    const palavras = limpo.split(/\s+/).filter(Boolean);
    const iniciais = palavras.map(p => p.charAt(0)).join('');
    return `${prefixo}${iniciais}`;
}

// ============================================================================
// LEITURA DE TODAS AS ABAS DA PLANILHA GOOGLE PUBLICADA
// ============================================================================
const CACHE_GLOBAL_KEY = 'bemhes_2027_cache_todas_abas_v1';

// Estado compartilhado em memória com todas as 8 abas carregadas
const BANCO_DADOS = {
    abas: {},    // { 'CLIENTES': [...], 'MUNICIPIO': [...], ... }
    colunas: {}  // { 'CLIENTES': [...], 'MUNICIPIO': [...], ... }
};

function extrairMapaGidsDoPubHtml(htmlText) {
    const mapa = {}; // { NOME_NORMALIZADO: gid }
    const regexAba = /items\.push\(\{name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"/gi;
    let match;
    while ((match = regexAba.exec(htmlText)) !== null) {
        mapa[normalizarTexto(match[1])] = match[2];
    }

    if (Object.keys(mapa).length === 0) {
        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        doc.querySelectorAll('a, li, button, span').forEach(el => {
            const txt = normalizarTexto(el.textContent);
            const href = el.getAttribute('href') || '';
            const idAttr = el.id || '';
            const mHref = href.match(/gid=(\d+)/);
            const mId = idAttr.match(/(\d+)/);
            if (txt && (mHref || mId)) {
                mapa[txt] = mHref ? mHref[1] : mId[1];
            }
        });
    }
    return mapa;
}

async function baixarCsvAba(pubId, gid) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?gid=${gid}&single=true&output=csv`;
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const csvText = await resp.text();
    const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim()
    });
    const cols = (parsed.meta.fields || []).filter(c => c && c.trim() !== '');
    const rows = (parsed.data || [])
        .filter(row => Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== ''))
        .map((row, idx) => ({ ...row, _rowNumber: idx + 2 }));
    return { cols, rows };
}

async function sincronizarTodasAsAbasPlanilha(forcarRede = true) {
    // Tenta carregar cache local primeiro se não for sincronização forçada
    if (!forcarRede) {
        const salvo = localStorage.getItem(CACHE_GLOBAL_KEY);
        if (salvo) {
            try {
                const obj = JSON.parse(salvo);
                if (obj && obj.abas && Object.keys(obj.abas).length > 0) {
                    BANCO_DADOS.abas = obj.abas;
                    BANCO_DADOS.colunas = obj.colunas || {};
                    garantirColunasPadraoEmTodasAbas();
                    return { origem: 'cache' };
                }
            } catch (e) {}
        }
    }

    // Se a URL do Apps Script estiver configurada, podemos tentar ler direto dela (dados 100% em tempo real, sem atraso de cache do pubhtml)
    const scriptUrl = obterUrlAppsScript();

    let mapaGidsPrincipal = {};
    try {
        const respHtml = await fetch(PUBHTML_PRINCIPAL_URL);
        const htmlText = await respHtml.text();
        mapaGidsPrincipal = extrairMapaGidsDoPubHtml(htmlText);
    } catch (e) {
        console.warn('Aviso ao ler pubhtml principal:', e);
    }

    let mapaGidsAux = {};
    if (!mapaGidsPrincipal[normalizarTexto('Código de Industria')]) {
        try {
            const respAux = await fetch(PUBHTML_INDUSTRIA_AUX_URL);
            const htmlAux = await respAux.text();
            mapaGidsAux = extrairMapaGidsDoPubHtml(htmlAux);
        } catch (e) {}
    }

    const promessas = Object.keys(CONFIG_ENTIDADES).map(async (nomeAba) => {
        const normAba = normalizarTexto(nomeAba);

        // 1. Tenta via Apps Script GET (caso esteja configurado) para obter dados instantâneos
        if (scriptUrl) {
            try {
                const r = await fetch(`${scriptUrl}?action=list&sheet=${encodeURIComponent(nomeAba)}`);
                const j = await r.json();
                if (j && j.status === 'ok' && Array.isArray(j.rows)) {
                    BANCO_DADOS.colunas[nomeAba] = j.headers || [];
                    BANCO_DADOS.abas[nomeAba] = j.rows;
                    return;
                }
            } catch (e) {
                console.warn(`Fallback para CSV público na aba ${nomeAba}:`, e);
            }
        }

        // 2. Lê da planilha Google publicada (/pub?gid=...&output=csv)
        let gid = mapaGidsPrincipal[normAba];
        let pubId = PUB_ID_PRINCIPAL;

        if (!gid && normAba === normalizarTexto('CLIENTES')) {
            gid = '0';
        }
        if (!gid && normAba === normalizarTexto('Código de Industria')) {
            gid = mapaGidsAux[normAba] || '0';
            pubId = PUB_ID_INDUSTRIA_AUX;
        }

        if (gid) {
            try {
                const { cols, rows } = await baixarCsvAba(pubId, gid);
                BANCO_DADOS.colunas[nomeAba] = cols;
                BANCO_DADOS.abas[nomeAba] = rows;
            } catch (e) {
                console.warn(`Erro ao baixar CSV da aba ${nomeAba} (gid=${gid}):`, e);
                if (!BANCO_DADOS.abas[nomeAba]) BANCO_DADOS.abas[nomeAba] = [];
            }
        } else {
            if (!BANCO_DADOS.abas[nomeAba]) BANCO_DADOS.abas[nomeAba] = [];
        }
    });

    await Promise.all(promessas);
    garantirColunasPadraoEmTodasAbas();
    salvarCacheGlobal();
    return { origem: 'rede' };
}

function garantirColunasPadraoEmTodasAbas() {
    Object.keys(CONFIG_ENTIDADES).forEach(nomeAba => {
        const cfg = CONFIG_ENTIDADES[nomeAba];
        const colsAtuais = BANCO_DADOS.colunas[nomeAba] || [];
        const resultado = [...colsAtuais];
        cfg.colunasPadrao.forEach(cp => {
            if (!resultado.some(c => normalizarTexto(c) === normalizarTexto(cp))) {
                if (normalizarTexto(cp) === 'ID') resultado.unshift(cp);
                else resultado.push(cp);
            }
        });
        BANCO_DADOS.colunas[nomeAba] = resultado;
        if (!BANCO_DADOS.abas[nomeAba]) BANCO_DADOS.abas[nomeAba] = [];
    });
}

function salvarCacheGlobal() {
    try {
        localStorage.setItem(CACHE_GLOBAL_KEY, JSON.stringify({
            abas: BANCO_DADOS.abas,
            colunas: BANCO_DADOS.colunas
        }));
    } catch (e) {}
}

// ============================================================================
// COMUNICAÇÃO DE ESCRITA COM O GOOGLE APPS SCRIPT (CREATE / UPDATE / DELETE)
// ============================================================================
async function enviarOperacaoPlanilhaGoogle({ action, sheet, record, keyField, keyValue, rowNumber }) {
    const scriptUrl = obterUrlAppsScript();
    if (!scriptUrl) {
        return {
            status: 'local_only',
            mensagem: 'Salvo localmente. Configure a URL do Apps Script para gravar direto na Planilha Google.'
        };
    }

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // Evita preflight CORS bloqueado pelo Google Apps Script
            },
            body: JSON.stringify({
                action,
                sheet,
                record,
                keyField,
                keyValue,
                rowNumber
            })
        });

        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Erro ao comunicar com Apps Script:', err);
        return {
            status: 'erro',
            mensagem: 'Falha de conexão com o Apps Script: ' + err.message
        };
    }
}
