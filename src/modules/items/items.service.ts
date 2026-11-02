import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateItemDto } from './dto/create-item.dto';

export interface Item {
  id: string;
  title: string;
  description?: string;
  price: number;
  createdAt: string;
}

@Injectable()
export class ItemsService {
  private items: Item[] = [
    {
      id: 'item-1',
      title: 'Fullstack Starter Kit',
      description: 'NestJS backend + Next.js frontend with Tailwind and Socket.IO',
      price: 29.99,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'item-2',
      title: 'Real-time Chat Module',
      description: 'Plug-and-play WebSocket chat with rooms and presence',
      price: 19.99,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'item-3',
      title: 'API Authentication Boilerplate',
      description: 'JWT tokens, refresh cookies, and role-based guards',
      price: 39.99,
      createdAt: new Date().toISOString(),
    },
  ];

  findAll(): Item[] {
    return this.items;
  }

  findOne(id: string): Item {
    const item = this.items.find((i) => i.id === id);
    if (!item) {
      throw new NotFoundException(`Item with ID "${id}" not found`);
    }
    return item;
  }

  create(dto: CreateItemDto): Item {
    const newItem: Item = {
      id: `item-${Date.now()}`,
      title: dto.title,
      description: dto.description || '',
      price: dto.price,
      createdAt: new Date().toISOString(),
    };
    this.items.push(newItem);
    return newItem;
  }

  delete(id: string): { success: boolean; message: string } {
    const index = this.items.findIndex((i) => i.id === id);
    if (index === -1) {
      throw new NotFoundException(`Item with ID "${id}" not found`);
    }
    this.items.splice(index, 1);
    return { success: true, message: `Item "${id}" deleted successfully` };
  }
}
