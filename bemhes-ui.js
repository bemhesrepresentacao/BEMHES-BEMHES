/**
 * ============================================================================
 * BEMHES 2027 — MOTOR DE INTERFACE E CRUD RELACIONAL (bemhes-ui.js)
 * ============================================================================
 */

let ABA_ATUAL = 'CLIENTES';
let indiceParaExcluir = -1;

// Inicialização da página
async function iniciarPaginaEntidade(nomeAba) {
    ABA_ATUAL = nomeAba;
    const cfg = CONFIG_ENTIDADES[ABA_ATUAL];
    if (!cfg) {
        console.error('Configuração não encontrada para a aba:', nomeAba);
        return;
    }

    // Atualiza datas e ícones no cabeçalho e rodapé
    lucide.createIcons();
    const elAno = document.getElementById('ano-atual');
    if (elAno) elAno.textContent = new Date().getFullYear();

    const elData = document.getElementById('data-atual');
    if (elData) {
        const opcoesData = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dataFormatada = new Date().toLocaleDateString('pt-BR', opcoesData);
        elData.textContent = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
    }

    // Renderiza barra de navegação entre as 8 páginas
    renderizarBarraNavegacao();
    atualizarBadgeApiScript();

    // Carrega cache rápido se existir e depois sincroniza com a planilha Google
    await sincronizarTodasAsAbasPlanilha(false);
    renderizarTabelaEntidade();

    // Sincroniza em tempo real com a rede
    atualizarStatus(`Sincronizando aba "${ABA_ATUAL}" e tabelas vinculadas...`, 'loading');
    try {
        await sincronizarTodasAsAbasPlanilha(true);
        const total = (BANCO_DADOS.abas[ABA_ATUAL] || []).length;
        const modoApi = obterUrlAppsScript() ? 'API Google Sheets Ativa' : 'Leitura Planilha + Cache Local';
        atualizarStatus(`Sincronizado (${total} registros em "${ABA_ATUAL}" • ${modoApi})`, 'ok');
        renderizarTabelaEntidade(document.getElementById('campo-busca')?.value || '');
    } catch (e) {
        atualizarStatus('Modo offline / cache local ativo', 'erro');
    }
}

function renderizarBarraNavegacao() {
    const navContainer = document.getElementById('barra-navegacao-abas');
    if (!navContainer) return;

    navContainer.innerHTML = PAGINAS_SISTEMA.map(pag => {
        const ativo = normalizarTexto(pag.aba) === normalizarTexto(ABA_ATUAL);
        const classes = ativo
            ? 'bg-trator text-white border-trator shadow-md font-bold'
            : 'bg-white hover:bg-cremeEscuro text-aco border-aco/20 font-semibold';
        return `
            <a href="${encodeURI(pag.arquivo)}"
               class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs sm:text-sm transition-all whitespace-nowrap ${classes}">
                <i data-lucide="${pag.icone}" class="w-4 h-4 ${ativo ? 'text-white' : 'text-petroleo'}"></i>
                <span>${escapeHTML(pag.label)}</span>
            </a>
        `;
    }).join('');
    lucide.createIcons();
}

function atualizarBadgeApiScript() {
    const btnApi = document.getElementById('btn-config-api');
    if (!btnApi) return;
    const url = obterUrlAppsScript();
    if (url) {
        btnApi.className = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-all shadow-sm';
        btnApi.innerHTML = `<i data-lucide="cloud-check" class="w-4 h-4"></i><span>Planilha Conectada</span>`;
    } else {
        btnApi.className = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-all shadow-sm';
        btnApi.innerHTML = `<i data-lucide="plug" class="w-4 h-4"></i><span>Conectar Apps Script</span>`;
    }
    lucide.createIcons();
}

function atualizarStatus(texto, tipo = 'ok') {
    const el = document.getElementById('status-planilha');
    if (!el) return;
    if (tipo === 'loading') {
        el.innerHTML = `<span class="w-2 h-2 rounded-full bg-ambar animate-ping"></span> <span>${escapeHTML(texto)}</span>`;
    } else if (tipo === 'erro') {
        el.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-red-600"></span> <span class="text-red-700">${escapeHTML(texto)}</span>`;
    } else {
        el.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> <span class="text-aco/80">${escapeHTML(texto)}</span>`;
    }
}

async function recarregarPlanilha() {
    atualizarStatus(`Recarregando dados da planilha Google...`, 'loading');
    await sincronizarTodasAsAbasPlanilha(true);
    const total = (BANCO_DADOS.abas[ABA_ATUAL] || []).length;
    atualizarStatus(`Sincronizado (${total} registros em "${ABA_ATUAL}")`, 'ok');
    renderizarTabelaEntidade(document.getElementById('campo-busca')?.value || '');
    mostrarToast(`Aba "${ABA_ATUAL}" e relacionamentos atualizados!`);
}

// ============================================================================
// DETERMINAÇÃO INTELIGENTE DAS COLUNAS DA TABELA PRINCIPAL
// ============================================================================
function obterColunasVisiveisTabela() {
    const cfg = CONFIG_ENTIDADES[ABA_ATUAL];
    const colsReais = BANCO_DADOS.colunas[ABA_ATUAL] || [];
    const selecionadas = [];

    // Prioriza as colunas configuradas para a tabela se existirem na aba
    cfg.colunasTabela.forEach(cDesejada => {
        const encontrada = colsReais.find(c => normalizarTexto(c) === normalizarTexto(cDesejada));
        if (encontrada && !selecionadas.includes(encontrada)) {
            selecionadas.push(encontrada);
        }
    });

    // Completa até 6 colunas caso a planilha tenha nomes de cabeçalho diferentes
    if (selecionadas.length < 3) {
        colsReais.forEach(c => {
            if (selecionadas.length < 6 && !selecionadas.includes(c)) {
                selecionadas.push(c);
            }
        });
    }

    return selecionadas.length > 0 ? selecionadas : cfg.colunasTabela;
}

// ============================================================================
// RENDERIZAÇÃO DA TABELA DE REGISTROS
// ============================================================================
function renderizarTabelaEntidade(filtro = '') {
    const theadRow = document.getElementById('tabela-headers-row');
    const tbody = document.getElementById('tabela-corpo');
    const loadingBox = document.getElementById('loading-box');
    const tabelaWrapper = document.getElementById('tabela-wrapper');
    const emptyBox = document.getElementById('empty-box');
    const contador = document.getElementById('contador-registros');

    if (loadingBox) loadingBox.classList.add('hidden');

    const registros = BANCO_DADOS.abas[ABA_ATUAL] || [];
    const colunasVisiveis = obterColunasVisiveisTabela();

    // Renderiza cabeçalho dinâmico
    if (theadRow) {
        theadRow.innerHTML = colunasVisiveis.map(col => `
            <th class="py-4 px-4 sm:px-5 whitespace-nowrap">${escapeHTML(col)}</th>
        `).join('') + `<th class="py-4 px-4 sm:px-5 text-right whitespace-nowrap">Ações</th>`;
    }

    const termo = normalizarTexto(filtro);
    const filtrados = registros
        .map((reg, indexOriginal) => ({ reg, indexOriginal }))
        .filter(({ reg }) => {
            if (!termo) return true;
            return Object.keys(reg).some(k => {
                if (k.startsWith('_')) return false;
                return normalizarTexto(reg[k]).includes(termo);
            });
        });

    if (contador) contador.textContent = filtrados.length;

    if (filtrados.length === 0) {
        if (tabelaWrapper) tabelaWrapper.classList.add('hidden');
        if (emptyBox) emptyBox.classList.remove('hidden');
        return;
    }

    if (emptyBox) emptyBox.classList.add('hidden');
    if (tabelaWrapper) tabelaWrapper.classList.remove('hidden');

    tbody.innerHTML = '';
    filtrados.forEach(({ reg, indexOriginal }) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-creme/80 transition-colors group';

        const tds = colunasVisiveis.map((col, colIdx) => {
            const cNorm = normalizarTexto(col);
            const valorBruto = reg[col] || '';
            const valor = aplicarFormatacaoPorColuna(col, valorBruto) || '—';

            if (cNorm === 'ID') {
                return `
                    <td class="py-3.5 px-4 sm:px-5 font-mono font-bold text-trator whitespace-nowrap">
                        <span class="px-2.5 py-1 rounded-md bg-trator/10 border border-trator/20 text-xs">${escapeHTML(valor)}</span>
                    </td>`;
            }
            if (cNorm.includes('CODIGO') || cNorm.includes('COD.')) {
                return `
                    <td class="py-3.5 px-4 sm:px-5 font-mono font-bold text-petroleo whitespace-nowrap">
                        <span class="px-2.5 py-1 rounded-md bg-petroleo/10 border border-petroleo/15 text-xs">${escapeHTML(valor)}</span>
                    </td>`;
            }
            if (cNorm === 'ESTADO' || cNorm === 'UF') {
                return `
                    <td class="py-3.5 px-4 sm:px-5">
                        <span class="inline-block px-2.5 py-0.5 rounded bg-cremeEscuro border border-aco/15 font-bold text-xs text-aco uppercase">${escapeHTML(valor)}</span>
                    </td>`;
            }
            // Coluna principal clicável (abre detalhes + registros correlacionados)
            if (colIdx === 1 || colIdx === 2 || cNorm === 'NOME' || cNorm === 'MUNICIPIO' || cNorm === 'DESCRICAO' || cNorm === 'GRUPO FAMILIAR') {
                return `
                    <td class="py-3.5 px-4 sm:px-5 font-semibold text-aco">
                        <button type="button" onclick="abrirModalDetalhes(${indexOriginal})"
                                class="text-left text-aco hover:text-trator font-bold underline decoration-trator/40 hover:decoration-trator underline-offset-4 transition-colors inline-flex items-center gap-1.5"
                                title="Consultar ficha completa e vínculos">
                            <span>${escapeHTML(valor)}</span>
                            <i data-lucide="external-link" class="w-3.5 h-3.5 text-trator opacity-70 group-hover:opacity-100"></i>
                        </button>
                    </td>`;
            }
            return `<td class="py-3.5 px-4 sm:px-5 text-aco/85">${escapeHTML(valor)}</td>`;
        }).join('');

        tr.innerHTML = tds + `
            <td class="py-3.5 px-4 sm:px-5 text-right whitespace-nowrap">
                <div class="inline-flex items-center justify-end gap-1.5">
                    <button type="button" onclick="abrirModalDetalhes(${indexOriginal})"
                            class="p-2 rounded-lg bg-cremeEscuro hover:bg-aco hover:text-white text-aco transition-colors"
                            title="Consultar Ficha e Relacionamentos">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                    <button type="button" onclick="abrirModalFormulario('editar', ${indexOriginal})"
                            class="p-2 rounded-lg bg-petroleo/10 hover:bg-petroleo text-petroleo hover:text-white transition-colors"
                            title="Editar Registro na Planilha">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button type="button" onclick="abrirModalExcluir(${indexOriginal})"
                            class="p-2 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white transition-colors"
                            title="Excluir Registro da Planilha">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function filtrarRegistros() {
    const termo = document.getElementById('campo-busca')?.value || '';
    renderizarTabelaEntidade(termo);
}

// ============================================================================
// MODAL 1: CONSULTA COMPLETA + TABELAS RELACIONADAS DO DIAGRAMA
// ============================================================================
function abrirModalDetalhes(index) {
    const registros = BANCO_DADOS.abas[ABA_ATUAL] || [];
    const reg = registros[index];
    if (!reg) return;

    const cfg = CONFIG_ENTIDADES[ABA_ATUAL];
    const idVal = obterValorCampo(reg, ['ID', 'COD. DE IND.', 'CODIGO']) || `#${index + 1}`;
    const tituloPrincipal = obterValorCampo(reg, ['NOME', 'CLIENTE', 'MUNICIPIO', 'DESCRICAO', 'GRUPO FAMILIAR']) || cfg.itemSingular;

    document.getElementById('detalhe-id-badge').textContent = `ID / CÓD: ${idVal}`;
    document.getElementById('detalhe-aba-badge').textContent = `ABA: ${ABA_ATUAL}`;
    document.getElementById('detalhe-titulo-nome').textContent = tituloPrincipal;

    const grid = document.getElementById('detalhes-grid');
    grid.innerHTML = '';

    const colunas = BANCO_DADOS.colunas[ABA_ATUAL] || Object.keys(reg).filter(k => !k.startsWith('_'));
    colunas.forEach(col => {
        const valorFormatado = aplicarFormatacaoPorColuna(col, reg[col] || '');
        const card = document.createElement('div');
        card.className = 'bg-white p-3.5 rounded-xl border border-aco/15 shadow-sm';
        card.innerHTML = `
            <span class="block text-[11px] font-bold uppercase tracking-wider text-petroleo mb-1">${escapeHTML(col)}</span>
            <span class="block text-sm font-semibold text-aco break-words">
                ${valorFormatado ? escapeHTML(valorFormatado) : '<span class="text-aco/35 italic font-normal">Não informado</span>'}
            </span>
        `;
        grid.appendChild(card);
    });

    // Renderiza registros correlacionados de outras abas conforme o diagrama
    const relContainer = document.getElementById('detalhes-relacionamentos');
    relContainer.innerHTML = '';

    (cfg.subTabelasDetalhe || []).forEach(sub => {
        const dadosOutraAba = BANCO_DADOS.abas[sub.aba] || [];
        const camposLocal = sub.campoFiltroLocal || ['CODIGO DO CLIENTE', 'NOME', 'ID'];
        const camposAlvo = sub.campoFiltroAlvo || ['CODIGO DO CLIENTE', 'CLIENTE', 'NOME', 'ID'];

        const valoresBusca = camposLocal
            .map(c => normalizarTexto(obterValorCampo(reg, c)))
            .filter(v => v !== '');

        const vinculados = dadosOutraAba.filter(item => {
            return camposAlvo.some(ca => {
                const valAlvo = normalizarTexto(obterValorCampo(item, ca));
                return valAlvo && valoresBusca.includes(valAlvo);
            });
        });

        const bloco = document.createElement('div');
        bloco.className = 'mt-5 pt-4 border-t border-aco/15';
        const paginaDestino = PAGINAS_SISTEMA.find(p => normalizarTexto(p.aba) === normalizarTexto(sub.aba));

        let listaHtml = '';
        if (vinculados.length === 0) {
            listaHtml = `<p class="text-xs text-aco/55 italic bg-white/60 p-3 rounded-xl border border-aco/10">Nenhum registro vinculado encontrado na aba "${escapeHTML(sub.aba)}".</p>`;
        } else {
            listaHtml = `<div class="space-y-2">` + vinculados.slice(0, 8).map(v => {
                const resumo = Object.keys(v)
                    .filter(k => !k.startsWith('_') && v[k])
                    .slice(0, 4)
                    .map(k => `<span class="text-xs"><strong class="text-petroleo">${escapeHTML(k)}:</strong> ${escapeHTML(v[k])}</span>`)
                    .join(' • ');
                return `<div class="p-2.5 rounded-xl bg-white border border-aco/15 text-aco">${resumo}</div>`;
            }).join('') + `</div>`;
        }

        bloco.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-display text-sm font-bold uppercase text-petroleo flex items-center gap-1.5">
                    <i data-lucide="${sub.icone}" class="w-4 h-4 text-trator"></i>
                    <span>${escapeHTML(sub.titulo)} (${vinculados.length})</span>
                </h4>
                ${paginaDestino ? `<a href="${encodeURI(paginaDestino.arquivo)}" class="text-xs font-bold text-trator hover:underline">Abrir ${escapeHTML(paginaDestino.label)} →</a>` : ''}
            </div>
            ${listaHtml}
        `;
        relContainer.appendChild(bloco);
    });

    document.getElementById('btn-detalhe-editar').onclick = () => {
        fecharModalDetalhes();
        abrirModalFormulario('editar', index);
    };
    document.getElementById('btn-detalhe-excluir').onclick = () => {
        fecharModalDetalhes();
        abrirModalExcluir(index);
    };

    const modal = document.getElementById('modal-detalhes');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function fecharModalDetalhes() {
    const modal = document.getElementById('modal-detalhes');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ============================================================================
// MODAL 2: FORMULÁRIO INTELIGENTE COM CORRELACIONAMENTO ENTRE ABAS
// ============================================================================
function abrirModalFormulario(modo, index = -1) {
    const cfg = CONFIG_ENTIDADES[ABA_ATUAL];
    const modal = document.getElementById('modal-formulario');
    const titulo = document.getElementById('form-titulo');
    const subtitulo = document.getElementById('form-subtitulo');
    const iconBox = document.getElementById('form-icon-box');
    const containerCampos = document.getElementById('form-campos-dinamicos');

    document.getElementById('registro-index-edicao').value = index;
    document.getElementById('registro-modo-edicao').value = modo;
    containerCampos.innerHTML = '';

    const registros = BANCO_DADOS.abas[ABA_ATUAL] || [];
    const registroAtual = (modo === 'editar' && index >= 0) ? registros[index] : {};

    if (modo === 'novo') {
        titulo.textContent = `Adicionar ${cfg.itemSingular}`;
        subtitulo.textContent = `Novo registro na aba "${ABA_ATUAL}" da Planilha Google`;
        iconBox.className = 'w-10 h-10 rounded-xl bg-trator text-white flex items-center justify-center';
        iconBox.innerHTML = `<i data-lucide="plus-circle" class="w-5 h-5"></i>`;
    } else {
        titulo.textContent = `Editar ${cfg.itemSingular}`;
        subtitulo.textContent = `Atualize os dados na aba "${ABA_ATUAL}" e salve`;
        iconBox.className = 'w-10 h-10 rounded-xl bg-petroleo text-white flex items-center justify-center';
        iconBox.innerHTML = `<i data-lucide="pencil" class="w-5 h-5"></i>`;
    }

    const colunas = BANCO_DADOS.colunas[ABA_ATUAL] || cfg.colunasPadrao;

    colunas.forEach((coluna, idx) => {
        const colNorm = normalizarTexto(coluna);
        const relacao = (cfg.relacoes || []).find(r => normalizarTexto(r.campoLocal) === colNorm);
        const relacaoDestino = (cfg.relacoes || []).find(r => r.preencherCampoLocal && normalizarTexto(r.preencherCampoLocal) === colNorm);

        let valorInicial = (modo === 'editar') ? (registroAtual[coluna] || '') : '';

        // Sugestão automática de ID / Código em novos cadastros
        if (modo === 'novo' && colNorm === 'ID') {
            valorInicial = sugerirProximoId(registros);
        } else if (modo === 'novo' && colNorm === 'CODIGO DO CLIENTE' && ABA_ATUAL === 'CLIENTES') {
            valorInicial = sugerirProximoCodigoNumerico(registros, 'CODIGO DO CLIENTE');
        }

        const div = document.createElement('div');
        if (colNorm.includes('ENDERECO') || colNorm.includes('OBSERVA') || colNorm === 'NOME' || colNorm.includes('DESCRICAO')) {
            div.className = 'sm:col-span-2';
        }

        const fieldId = `campo-form-${idx}`;

        // CASO A: Campo com relacionamento (Dropdown populado a partir da aba vinculada no diagrama!)
        if (relacao) {
            const dadosOrigem = BANCO_DADOS.abas[relacao.abaOrigem] || [];
            const mapaOpcoes = new Map();

            dadosOrigem.forEach(item => {
                const valPrincipal = obterValorCampo(item, relacao.campoOrigem).toString().trim();
                const valSecundario = relacao.campoOrigemDestino
                    ? obterValorCampo(item, relacao.campoOrigemDestino).toString().trim()
                    : '';
                if (valPrincipal) {
                    const k = normalizarTexto(valPrincipal);
                    if (!mapaOpcoes.has(k)) {
                        mapaOpcoes.set(k, { principal: valPrincipal, secundario: valSecundario });
                    }
                }
            });

            const opcoesOrdenadas = Array.from(mapaOpcoes.values()).sort((a, b) =>
                a.principal.localeCompare(b.principal, 'pt-BR')
            );

            const valNorm = normalizarTexto(valorInicial);
            const existe = opcoesOrdenadas.some(o => normalizarTexto(o.principal) === valNorm);

            let optionsHtml = `<option value="">Selecione (${escapeHTML(relacao.abaOrigem)})...</option>`;
            if (valorInicial && !existe) {
                optionsHtml += `<option value="${escapeHTML(valorInicial)}" data-vinculo="" selected>${escapeHTML(valorInicial)}</option>`;
            }
            opcoesOrdenadas.forEach(op => {
                const sel = normalizarTexto(op.principal) === valNorm ? 'selected' : '';
                const sufixo = op.secundario ? ` (${escapeHTML(op.secundario)})` : '';
                optionsHtml += `<option value="${escapeHTML(op.principal)}" data-vinculo="${escapeHTML(op.secundario)}" ${sel}>${escapeHTML(op.principal)}${sufixo}</option>`;
            });

            const targetField = relacao.preencherCampoLocal || '';

            div.innerHTML = `
                <label for="${fieldId}" class="block text-xs font-bold uppercase text-petroleo mb-1">
                    ${escapeHTML(coluna)}
                    <span class="text-[10px] font-normal text-trator normal-case ml-1">(${escapeHTML(relacao.labelExtra)})</span>
                </label>
                <select id="${fieldId}"
                        data-coluna="${escapeHTML(coluna)}"
                        data-target-field="${escapeHTML(targetField)}"
                        onchange="aoSelecionarRelacionamento(this)"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-aco/25 text-sm font-semibold text-aco focus:outline-none focus:border-trator transition-colors">
                    ${optionsHtml}
                </select>
            `;
            containerCampos.appendChild(div);
            return;
        }

        // CASO B: Campo preenchido automaticamente por um relacionamento (ex: ESTADO, COD. DE IND., CODIGO DO CLIENTE)
        if (relacaoDestino) {
            div.innerHTML = `
                <label for="${fieldId}" class="block text-xs font-bold uppercase text-petroleo mb-1">
                    ${escapeHTML(coluna)}
                    <span class="text-[10px] font-normal text-aco/60 normal-case ml-1">(Vinculado automaticamente)</span>
                </label>
                <input type="text"
                       id="${fieldId}"
                       data-coluna="${escapeHTML(coluna)}"
                       value="${escapeHTML(valorInicial)}"
                       placeholder="Preenchido pelo vínculo"
                       class="w-full px-3.5 py-2.5 rounded-xl bg-cremeEscuro/70 font-bold text-petroleo border border-aco/25 text-sm focus:outline-none focus:border-trator transition-colors">
            `;
            containerCampos.appendChild(div);
            return;
        }

        // CASO C: Campos SIM / NÃO
        if (COLUNAS_SELECAO_SIM_NAO.some(s => normalizarTexto(s) === colNorm)) {
            const selAtual = normalizarSelecao(valorInicial);
            div.innerHTML = `
                <label for="${fieldId}" class="block text-xs font-bold uppercase text-petroleo mb-1">
                    ${escapeHTML(coluna)}
                </label>
                <select id="${fieldId}"
                        data-coluna="${escapeHTML(coluna)}"
                        class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-aco/25 text-sm font-semibold text-aco focus:outline-none focus:border-trator transition-colors">
                    <option value="" ${selAtual === '' ? 'selected' : ''}>Selecione...</option>
                    <option value="SIM" ${selAtual === 'SIM' ? 'selected' : ''}>SIM</option>
                    <option value="NÃO" ${selAtual === 'NAO' ? 'selected' : ''}>NÃO</option>
                </select>
            `;
            containerCampos.appendChild(div);
            return;
        }

        // CASO D: Campos de Data
        if (colNorm.includes('NASCIMENTO') || colNorm.startsWith('DATA')) {
            div.innerHTML = `
                <label for="${fieldId}" class="block text-xs font-bold uppercase text-petroleo mb-1">
                    ${escapeHTML(coluna)}
                </label>
                <input type="date"
                       id="${fieldId}"
                       data-coluna="${escapeHTML(coluna)}"
                       value="${escapeHTML(paraInputDate(valorInicial))}"
                       class="w-full px-3.5 py-2.5 rounded-xl bg-white border border-aco/25 text-sm text-aco focus:outline-none focus:border-trator transition-colors">
            `;
            containerCampos.appendChild(div);
            return;
        }

        // CASO E: Inputs padrão com máscaras inteligentes
        let tipoInput = 'text';
        let placeholder = `Digite ${coluna.toLowerCase()}`;
        if (colNorm.includes('EMAIL') || colNorm.includes('E-MAIL')) {
            tipoInput = 'email';
            placeholder = 'exemplo@dominio.com.br';
        } else if (colNorm === 'CEP') {
            placeholder = '00000-000';
            valorInicial = formatarCEP(valorInicial);
        } else if (colNorm === 'CPF') {
            placeholder = '000.000.000-00';
            valorInicial = formatarCPF(valorInicial);
        } else if (colNorm === 'CNPJ') {
            placeholder = '00.000.000/0000-00';
            valorInicial = formatarCNPJ(valorInicial);
        } else if (colNorm.includes('FONE') || colNorm === 'TELEFONE') {
            placeholder = '(00) 00000-0000';
            valorInicial = aplicarFormatacaoPorColuna(coluna, valorInicial);
        }

        const ehId = colNorm === 'ID';
        const ehNome = colNorm === 'NOME' && ABA_ATUAL === 'CLIENTES';
        const eventoInput = (ehNome && modo === 'novo')
            ? `oninput="atualizarIdMCBPorNome(this.value)"`
            : `oninput="aplicarMascaraTempoReal(this, '${escapeHTML(colNorm)}')"`;

        div.innerHTML = `
            <label for="${fieldId}" class="block text-xs font-bold uppercase text-petroleo mb-1">
                ${escapeHTML(coluna)} ${ehId ? '<span class="text-trator">*</span>' : ''}
            </label>
            <input type="${tipoInput}"
                   id="${fieldId}"
                   data-coluna="${escapeHTML(coluna)}"
                   value="${escapeHTML(valorInicial)}"
                   ${ehId ? 'required' : ''}
                   ${eventoInput}
                   placeholder="${escapeHTML(placeholder)}"
                   class="w-full px-3.5 py-2.5 rounded-xl ${ehId ? 'bg-cremeEscuro/70 font-mono font-bold text-trator' : 'bg-white text-aco'} border border-aco/25 text-sm focus:outline-none focus:border-trator transition-colors">
        `;
        containerCampos.appendChild(div);
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function aoSelecionarRelacionamento(selectEl) {
    const targetField = selectEl.getAttribute('data-target-field');
    if (!targetField) return;
    const opt = selectEl.options[selectEl.selectedIndex];
    const valorVinculado = opt ? (opt.getAttribute('data-vinculo') || '') : '';

    const inputs = document.querySelectorAll('#form-campos-dinamicos input[data-coluna], #form-campos-dinamicos select[data-coluna]');
    inputs.forEach(inp => {
        if (normalizarTexto(inp.getAttribute('data-coluna')) === normalizarTexto(targetField)) {
            if (valorVinculado) inp.value = valorVinculado;
        }
    });
}

function atualizarIdMCBPorNome(nome) {
    const inputs = document.querySelectorAll('#form-campos-dinamicos input[data-coluna]');
    inputs.forEach(inp => {
        if (normalizarTexto(inp.getAttribute('data-coluna')) === 'ID') {
            inp.value = gerarIdPadraoMCB(nome, 'MCB-');
        }
    });
}

function sugerirProximoId(registros) {
    if (ABA_ATUAL === 'CLIENTES') return 'MCB-';
    let maior = 0;
    registros.forEach(r => {
        const val = obterValorCampo(r, ['ID', 'CODIGO']);
        const num = parseInt(String(val).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maior) maior = num;
    });
    return String(maior + 1);
}

function sugerirProximoCodigoNumerico(registros, campo) {
    let maior = 0;
    registros.forEach(r => {
        const val = obterValorCampo(r, [campo]);
        const num = parseInt(String(val).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maior) maior = num;
    });
    return String(maior + 1);
}

function fecharModalFormulario() {
    const modal = document.getElementById('modal-formulario');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ============================================================================
// SALVAR REGISTRO (ADICIONAR / EDITAR) -> ATUALIZA TELA + ENVIA AO GOOGLE SHEETS
// ============================================================================
async function salvarRegistro(event) {
    event.preventDefault();
    const index = parseInt(document.getElementById('registro-index-edicao').value, 10);
    const modo = document.getElementById('registro-modo-edicao').value;
    const campos = document.querySelectorAll('#form-campos-dinamicos input[data-coluna], #form-campos-dinamicos select[data-coluna]');

    const registros = BANCO_DADOS.abas[ABA_ATUAL] || [];
    const registroOriginal = (modo === 'editar' && index >= 0) ? { ...registros[index] } : {};
    const registroNovo = { ...registroOriginal };

    campos.forEach(campo => {
        const nomeColuna = campo.getAttribute('data-coluna');
        registroNovo[nomeColuna] = aplicarFormatacaoPorColuna(nomeColuna, campo.value.trim());
    });

    if (modo === 'novo' && ABA_ATUAL === 'CLIENTES') {
        const nomeCli = obterValorCampo(registroNovo, ['NOME']);
        const chaveId = Object.keys(registroNovo).find(k => normalizarTexto(k) === 'ID') || 'ID';
        if (!registroNovo[chaveId] || registroNovo[chaveId] === 'MCB-') {
            registroNovo[chaveId] = gerarIdPadraoMCB(nomeCli, 'MCB-');
        }
    }

    // Identifica chave primária para localizar a linha no Google Sheets
    const cfg = CONFIG_ENTIDADES[ABA_ATUAL];
    let keyField = '';
    let keyValue = '';
    for (const kCand of cfg.chavePrimaria) {
        const colReal = (BANCO_DADOS.colunas[ABA_ATUAL] || []).find(c => normalizarTexto(c) === normalizarTexto(kCand));
        if (colReal) {
            const valOrig = (modo === 'editar' ? registroOriginal[colReal] : registroNovo[colReal]) || '';
            if (String(valOrig).trim() !== '') {
                keyField = colReal;
                keyValue = String(valOrig).trim();
                break;
            }
        }
    }

    const btnSalvar = document.getElementById('btn-submit-form');
    const textoOriginalBtn = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Gravando na Planilha...</span>`;
    lucide.createIcons();

    const resp = await enviarOperacaoPlanilhaGoogle({
        action: modo === 'editar' ? 'update' : 'create',
        sheet: ABA_ATUAL,
        record: registroNovo,
        keyField,
        keyValue,
        rowNumber: registroOriginal._rowNumber || null
    });

    btnSalvar.disabled = false;
    btnSalvar.innerHTML = textoOriginalBtn;

    if (resp.status === 'erro') {
        mostrarToast('Erro ao gravar na planilha: ' + resp.mensagem);
        return;
    }

    if (resp.rowNumber) {
        registroNovo._rowNumber = resp.rowNumber;
    }

    if (modo === 'editar' && index >= 0) {
        registros[index] = registroNovo;
    } else {
        registros.push(registroNovo);
    }

    BANCO_DADOS.abas[ABA_ATUAL] = registros;
    salvarCacheGlobal();
    fecharModalFormulario();
    filtrarRegistros();

    if (resp.status === 'ok') {
        mostrarToast(`Salvo diretamente na aba "${ABA_ATUAL}" do Google Sheets!`);
    } else {
        mostrarToast('Salvo localmente! Conecte o Apps Script para gravar na planilha.');
    }
}

// ============================================================================
// MODAL 3: EXCLUIR REGISTRO -> REMOVE DA TELA + EXCLUI NO GOOGLE SHEETS
// ============================================================================
function abrirModalExcluir(index) {
    const registros = BANCO_DADOS.abas[ABA_ATUAL] || [];
    const reg = registros[index];
    if (!reg) return;

    indiceParaExcluir = index;
    const identificador = obterValorCampo(reg, ['ID', 'CODIGO DO CLIENTE', 'COD. DE IND.']) || '';
    const nome = obterValorCampo(reg, ['NOME', 'CLIENTE', 'MUNICIPIO', 'DESCRICAO', 'GRUPO FAMILIAR']) || `Registro #${index + 1}`;
    document.getElementById('excluir-nome-registro').textContent = identificador ? `${identificador} - ${nome}` : nome;

    document.getElementById('btn-confirmar-exclusao').onclick = confirmarExclusao;

    const modal = document.getElementById('modal-excluir');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function fecharModalExcluir() {
    const modal = document.getElementById('modal-excluir');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    indiceParaExcluir = -1;
}

async function confirmarExclusao() {
    const registros = BANCO_DADOS.abas[ABA_ATUAL] || [];
    if (indiceParaExcluir < 0 || indiceParaExcluir >= registros.length) return;

    const reg = registros[indiceParaExcluir];
    const cfg = CONFIG_ENTIDADES[ABA_ATUAL];

    let keyField = '';
    let keyValue = '';
    for (const kCand of cfg.chavePrimaria) {
        const colReal = (BANCO_DADOS.colunas[ABA_ATUAL] || []).find(c => normalizarTexto(c) === normalizarTexto(kCand));
        if (colReal && reg[colReal] && String(reg[colReal]).trim() !== '') {
            keyField = colReal;
            keyValue = String(reg[colReal]).trim();
            break;
        }
    }

    const btnConfirmar = document.getElementById('btn-confirmar-exclusao');
    const htmlOrig = btnConfirmar.innerHTML;
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Excluindo...</span>`;
    lucide.createIcons();

    const resp = await enviarOperacaoPlanilhaGoogle({
        action: 'delete',
        sheet: ABA_ATUAL,
        record: reg,
        keyField,
        keyValue,
        rowNumber: reg._rowNumber || null
    });

    btnConfirmar.disabled = false;
    btnConfirmar.innerHTML = htmlOrig;

    if (resp.status === 'erro') {
        mostrarToast('Erro ao excluir na planilha: ' + resp.mensagem);
        fecharModalExcluir();
        return;
    }

    registros.splice(indiceParaExcluir, 1);
    BANCO_DADOS.abas[ABA_ATUAL] = registros;
    salvarCacheGlobal();
    filtrarRegistros();
    fecharModalExcluir();

    if (resp.status === 'ok') {
        mostrarToast(`Registro excluído da aba "${ABA_ATUAL}" no Google Sheets!`);
    } else {
        mostrarToast('Registro removido localmente!');
    }
}

// ============================================================================
// MODAL 4: CONFIGURAÇÃO DA URL DO GOOGLE APPS SCRIPT
// ============================================================================
function abrirModalConfigApi() {
    const modal = document.getElementById('modal-config-api');
    const input = document.getElementById('input-url-apps-script');
    if (input) input.value = obterUrlAppsScript();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function fecharModalConfigApi() {
    const modal = document.getElementById('modal-config-api');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function salvarConfigApi(event) {
    event.preventDefault();
    const url = document.getElementById('input-url-apps-script').value.trim();
    salvarUrlAppsScript(url);
    atualizarBadgeApiScript();
    fecharModalConfigApi();
    if (url) {
        mostrarToast('URL do Apps Script salva! Testando sincronização...');
        await recarregarPlanilha();
    } else {
        mostrarToast('URL removida. Operando em modo de leitura.');
    }
}

function mostrarToast(mensagem) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toast-msg').textContent = mensagem;
    toast.classList.remove('hidden');
    toast.classList.add('flex');
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('flex');
    }, 4500);
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharModalDetalhes();
        fecharModalFormulario();
        fecharModalExcluir();
        fecharModalConfigApi();
    }
});
