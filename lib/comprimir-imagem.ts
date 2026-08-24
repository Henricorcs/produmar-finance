/**
 * Encolhe a foto no próprio celular, antes de subir.
 *
 * A câmera de um celular de hoje entrega de 3 a 5 MB por foto. Nada disso é
 * necessário para o que o sistema mostra: comprovante, chapa de máquina, brinco
 * de animal, ferramenta. Reduzindo o maior lado para 1600px em qualidade 80% a
 * foto cai para 200~400 kB — dez vezes menor — e continua legível de sobra.
 *
 * Ganha nos dois lados: ocupa dez vezes menos disco no servidor e o envio fica
 * dez vezes mais rápido no 4G ruim do pasto, que é onde o técnico está quando
 * manda a foto.
 *
 * Regra de ouro deste arquivo: NUNCA atrapalhar o envio. Se o arquivo não for
 * imagem (PDF e XML de nota fiscal passam por aqui também), se o navegador não
 * souber abrir, ou se o resultado ficar maior que o original, devolvemos o
 * arquivo do jeito que veio.
 */

/** Maior lado da foto depois de encolhida. */
const LADO_MAXIMO = 1600;

/** Qualidade do JPEG (0 a 1). 0,8 é o ponto em que o olho não vê diferença. */
const QUALIDADE = 0.8;

/**
 * Fotos menores que isto já estão de bom tamanho — mexer só perderia qualidade
 * à toa. Assinaturas em canvas, por exemplo, chegam aqui com poucos kB.
 */
const TAMANHO_MINIMO_PARA_MEXER = 300 * 1024;

/** Só encolhemos o que dá para redesenhar num canvas com segurança. */
function ehImagemQueSabemosEncolher(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(file.type);
}

/** Troca a extensão do nome por .jpg, já que a saída é sempre JPEG. */
function nomeComoJpg(nome: string): string {
  return nome.replace(/\.[^.]+$/, "") + ".jpg";
}

/**
 * Devolve a foto encolhida, ou o próprio arquivo quando não dá (ou não vale) a
 * pena mexer. Nunca lança erro.
 */
export async function comprimirImagem(file: File): Promise<File> {
  if (!ehImagemQueSabemosEncolher(file)) return file;
  if (file.size <= TAMANHO_MINIMO_PARA_MEXER) return file;
  if (typeof createImageBitmap !== "function") return file;

  try {
    // `from-image` respeita a orientação gravada pela câmera no EXIF. Sem isso
    // a foto tirada em pé chega deitada no sistema.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const maiorLado = Math.max(bitmap.width, bitmap.height);
    const escala = maiorLado > LADO_MAXIMO ? LADO_MAXIMO / maiorLado : 1;
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    // Fundo branco: PNG com transparência viraria preto ao virar JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALIDADE)
    );

    // Sem blob, ou encolher engordou o arquivo (acontece com print de tela em
    // PNG chapado): fica o original.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], nomeComoJpg(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // HEIC do iPhone vindo da galeria, imagem corrompida, memória curta no
    // celular antigo: sobe do jeito que veio. Foto grande é melhor que foto
    // nenhuma.
    return file;
  }
}

/** Mesma coisa para vários arquivos de uma vez (anexos em lote). */
export async function comprimirImagens(files: File[]): Promise<File[]> {
  return Promise.all(files.map(comprimirImagem));
}
