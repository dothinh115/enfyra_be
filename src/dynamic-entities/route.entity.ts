import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from './role.entity';

@Entity()
export class Route {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ default: 'GET' })
  method: string;

  @Column({ nullable: false })
  path: string;

  @Column({ type: 'text' })
  handler: string;

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @ManyToMany(() => Role, (role) => role.routes)
  @JoinTable()
  roles: Role[];
}
