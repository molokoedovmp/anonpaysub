export type CreateInvoiceInput = {
  amount: number
  currency: string
  description?: string
}

export type Invoice = {
  id: string
  payUrl: string
}

export interface PaymentProvider {
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>
}

export class NotImplementedProvider implements PaymentProvider {
  async createInvoice(): Promise<Invoice> {
    throw new Error('Payment provider not implemented')
  }
}
