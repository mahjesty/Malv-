import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SupportTicketEntity, type SupportTicketPriority, type SupportTicketStatus } from "../db/entities/support-ticket.entity";
import { SupportMessageEntity, type SupportMessageFromRole } from "../db/entities/support-message.entity";
import { SupportCategoryEntity } from "../db/entities/support-category.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { forwardRef, Inject } from "@nestjs/common";

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicketEntity) private readonly tickets: Repository<SupportTicketEntity>,
    @InjectRepository(SupportMessageEntity) private readonly messages: Repository<SupportMessageEntity>,
    @InjectRepository(SupportCategoryEntity) private readonly categories: Repository<SupportCategoryEntity>,
    private readonly killSwitch: KillSwitchService,
    @Inject(forwardRef(() => RealtimeGateway)) private readonly realtime: RealtimeGateway
  ) {}

  async ensureDefaultCategory(): Promise<SupportCategoryEntity> {
    let cat = await this.categories.findOne({ where: { slug: "general" } });
    if (cat) return cat;
    cat = this.categories.create({
      name: "General",
      slug: "general",
      sortOrder: 0
    });
    await this.categories.save(cat);
    return cat;
  }

  async listCategories() {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "support_read" });
    await this.ensureDefaultCategory();
    const rows = await this.categories.find({ order: { sortOrder: "ASC", name: "ASC" } });
    return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  }

  async createTicket(args: {
    userId: string;
    subject: string;
    categoryId?: string | null;
    priority: SupportTicketPriority;
    initialMessage: string;
  }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "support_mutation" });
    const cat = args.categoryId
      ? await this.categories.findOne({ where: { id: args.categoryId } })
      : await this.ensureDefaultCategory();
    if (!cat) throw new BadRequestException("Invalid category.");

    const ticket = this.tickets.create({
      user: { id: args.userId } as any,
      category: cat,
      priority: args.priority,
      status: "open" as SupportTicketStatus,
      subject: args.subject
    });
    await this.tickets.save(ticket);

    const msg = this.messages.create({
      ticket,
      user: { id: args.userId } as any,
      fromRole: "user" as SupportMessageFromRole,
      content: args.initialMessage,
      internalNote: false
    });
    await this.messages.save(msg);

    this.realtime.emitToSupportTicket(ticket.id, "support:ticket_update", {
      ticketId: ticket.id,
      status: ticket.status,
      at: Date.now()
    });

    return ticket;
  }

  async listTickets(args: { userId: string; limit: number; offset: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "support_read" });
    const [rows, total] = await this.tickets.findAndCount({
      where: { user: { id: args.userId } },
      relations: ["category"],
      order: { updatedAt: "DESC" },
      take: args.limit,
      skip: args.offset
    });
    return {
      items: rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        category: t.category ? { id: t.category.id, name: t.category.name, slug: t.category.slug } : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        closedAt: t.closedAt ?? null
      })),
      total
    };
  }

  async getTicketDetail(args: { userId: string; ticketId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "support_read" });
    const ticket = await this.tickets.findOne({
      where: { id: args.ticketId, user: { id: args.userId } },
      relations: ["category"]
    });
    if (!ticket) throw new NotFoundException("Ticket not found.");

    const msgs = await this.messages.find({
      where: { ticket: { id: args.ticketId }, internalNote: false },
      relations: ["user"],
      order: { createdAt: "ASC" }
    });

    return {
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category
          ? { id: ticket.category.id, name: ticket.category.name, slug: ticket.category.slug }
          : null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        closedAt: ticket.closedAt ?? null
      },
      messages: msgs.map((m) => ({
        id: m.id,
        fromRole: m.fromRole,
        content: m.content,
        createdAt: m.createdAt,
        userId: (m.user as any)?.id
      }))
    };
  }

  async addMessage(args: { userId: string; ticketId: string; content: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "support_mutation" });
    const ticket = await this.tickets.findOne({ where: { id: args.ticketId, user: { id: args.userId } } });
    if (!ticket) throw new NotFoundException("Ticket not found.");
    if (ticket.status === "closed") throw new BadRequestException("Ticket is closed.");

    const msg = this.messages.create({
      ticket,
      user: { id: args.userId } as any,
      fromRole: "user" as SupportMessageFromRole,
      content: args.content,
      internalNote: false
    });
    await this.messages.save(msg);

    this.realtime.emitToSupportTicket(ticket.id, "support:message", {
      ticketId: ticket.id,
      messageId: msg.id,
      at: Date.now()
    });

    return msg;
  }
}
