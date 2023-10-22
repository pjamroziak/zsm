import { Service } from '@freshgum/typedi';
import axios, { Axios } from 'axios';
import { z } from 'zod';
import { LoggerService } from '../../utils/logger.service';
import { JSDOM } from 'jsdom';
import { DateTime } from 'luxon';

const scrapSiteTaskConfigSchema = z.object({
  baseUrl: z.string(),
  auth: z.object({
    username: z.string(),
    password: z.string()
  })
})

type ScrapSiteTaskConfigType = z.infer<typeof scrapSiteTaskConfigSchema>;

@Service([LoggerService])
class ScrapSiteTaskConfig implements ScrapSiteTaskConfigType {
  readonly baseUrl: string;
  readonly auth: { username: string; password: string; };

  constructor(
    private readonly logger: LoggerService
  ) {
    const validResult = scrapSiteTaskConfigSchema.safeParse({
      baseUrl: process.env.SCRAP_SITE_TASK_BASE_URL,
      auth: {
        username: process.env.SCRAP_SITE_TASK_USERNAME,
        password: process.env.SCRAP_SITE_TASK_PASSWORD,
      }
    })

    if (validResult.success) {
      this.baseUrl = validResult.data.baseUrl;
      this.auth = validResult.data.auth;

      this.logger.info('ScrapSiteTaskConfig initialized succesfuelly');
    } else {
      throw new Error('ScrapSiteTaskConfig initialization failed: ' + validResult.error.message);
    }
  }
}

type ApartmentInfo = {
  type: string;
  number: string;
}

@Service([ScrapSiteTaskConfig, LoggerService])
export class ScrapSiteTask {
  private readonly http: Axios;

  constructor(
    private readonly config: ScrapSiteTaskConfig,
    private readonly logger: LoggerService,
  ) {
    this.http = axios.create({
      baseURL: config.baseUrl,
    });
  }

  async run() {
    const response = await this.http.post('/', this.getAuthFormData());
    const { window: { document: mainDocument }} = new JSDOM(response.data);

    const apartmentInfo = this.getApartmentInfo(mainDocument);
    const lastPageIndex = this.findLastPageIndex(mainDocument);

    const incomes = [];
    const outcomes = [];

    for (let index = 1; index <= lastPageIndex; index++) {
      const response = await this.http.post('/', this.getAuthFormData(), {
        params: {
          lokal: apartmentInfo.number,
          typobrotu: apartmentInfo.type,
          strona: index,
        }
      });

      const { window: { document: pageDocument }} = new JSDOM(response.data);
      const rows = (pageDocument.querySelector('table[summary=\'Rozrachunki lokalu\'') as HTMLTableElement | null)?.rows;

      if (!rows) {
        throw {
          message: 'Rows is missing'
        };
      }

      const { incomes: inc, outcomes: outc } = this.parseTable(rows);
      incomes.push(...inc);
      outcomes.push(...outc);
    } 
  }

  private getAuthFormData() {
    const formData = new FormData();
    formData.append('login', this.config.auth.username);
    formData.append('pass', this.config.auth.password);

    return formData;
  }

  private parseTable(rows: HTMLCollectionOf<HTMLTableRowElement>) {
    const headersRow = rows[0];
    if (headersRow) {
      const cells = headersRow.cells;
      if (cells.length !== 7) {
        throw {
          message: `Table row has ${cells.length} cells instead of 7`,
          cells: Array.from(cells).map(cell => cell.textContent).join(',')
        };
      }
    }

    const incomes = [];
    const outcomes = [];
    
    for (let index = 1; index < rows.length; index++) {
      const cells = rows.item(index)?.cells;

      if (!cells) {
        throw {
          message: 'Invalid cells'
        }
      }

      const createDateCell = cells.item(0)?.textContent ?? '';
      const outcomeCell = cells.item(1)?.textContent?.trim().replace(',', '.') ?? '';
      const incomeCell = cells.item(2)?.textContent?.trim().replace(',', '.') ?? '';
      const maxPaymentDateCell = cells.item(3)?.textContent ?? '';
      const documentNumberCell = cells.item(4)?.textContent;
      const descriptionCell = cells.item(5)?.textContent;
      const previewLinkCell = (cells.item(6)?.children.item(0) as HTMLAnchorElement | null)?.href;

      const income = parseFloat(incomeCell);
      const outcome = parseFloat(outcomeCell);

      if(!Number.isNaN(income)) {
        incomes.push({
          createdAt: DateTime.fromFormat(createDateCell, 'dd.LL.yyyy').toString(),
          income: income,
          documentNumber: documentNumberCell,
          description: descriptionCell,
        })
        continue;
      }

      if(!Number.isNaN(outcome)) {
        outcomes.push({
          createdAt: DateTime.fromFormat(createDateCell, 'dd.LL.yyyy').toString(),
          outcome: outcome,
          maxPaymentDate: DateTime.fromFormat(maxPaymentDateCell, 'dd.LL.yyyy').toString(),
          documentNumber: documentNumberCell,
          description: descriptionCell,
          detailsLink: previewLinkCell,
        })
        continue;
      }
    }

    return {
      incomes,
      outcomes
    }
  }

  private findLastPageIndex(doc: Document): number {
    const div = doc.querySelector('div#stronnicowanie');
    const lastPageAnchorElement = div?.children.item(div.children.length - 2);

    return Number(lastPageAnchorElement?.textContent);
  }

  private getApartmentInfo(doc: Document): ApartmentInfo {
    const apartmentNumberAnchorElement = (doc.querySelector("div#typy_obrotu a.active") as HTMLAnchorElement | null);

    if (!apartmentNumberAnchorElement) {
      throw {
        message: 'Anchor Element for Apartment Number not found',
      };
    }

    const APARTMENT_NUMBER_PART = 'lokal=';
    const APARTMENT_TYPE_PART = 'typobrotu=';

    const { href } = apartmentNumberAnchorElement;
    const number = href.slice(
      href.indexOf(APARTMENT_NUMBER_PART) + APARTMENT_NUMBER_PART.length,
      href.indexOf('&')
    );
    const type = href.slice(
      href.indexOf(APARTMENT_TYPE_PART) + APARTMENT_TYPE_PART.length
    );

    return {
      type,
      number
    };
  }
}