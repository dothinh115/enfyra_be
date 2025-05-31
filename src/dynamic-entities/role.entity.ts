import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  ManyToMany,
  ManyToOne,
  OneToOne,
  JoinTable,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Setting } from './setting.entity';

import { User } from './user.entity';
import { Route } from './route.entity';

@Entity()
export class Role {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', nullable: false })
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @ManyToMany(() => Route, (route) => route.roles)
  routes: Route[];
}
