import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Category } from './category.entity';

import { Role } from './role.entity';

import { Setting } from './setting.entity';

import { User } from './user.entity';

@Entity("route")
export class Route {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false})
  method: string;

  @Column({type:'varchar', nullable: false})
  path: string;

  @Column({type:'text', nullable: false})
  handler: string;

  @Column({type:'boolean', nullable: false})
  isPublished: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}